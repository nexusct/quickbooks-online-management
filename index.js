require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');
const ForensicAnalyzer = require('./lib/forensicAnalyzer');
const AnalyticsEngine = require('./lib/analyticsEngine');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// OAuth2 client setup
const oauthClient = new OAuthClient({
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  environment: process.env.QB_ENVIRONMENT,
  redirectUri: process.env.QB_REDIRECT_URI,
});

// Store tokens - in a real application, use a database
let qboTokens = {};
let qboConnection = null;

// Initialize analysis engines
const forensicAnalyzer = new ForensicAnalyzer();
const analyticsEngine = new AnalyticsEngine();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start OAuth flow
app.get('/auth/quickbooks', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'teststate',
  });
  res.redirect(authUri);
});

// OAuth callback
app.get('/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    qboTokens = {
      token_type: authResponse.token_type,
      access_token: authResponse.access_token,
      refresh_token: authResponse.refresh_token,
      expires_in: authResponse.expires_in,
      x_refresh_token_expires_in: authResponse.x_refresh_token_expires_in,
      realmId: authResponse.realmId,
    };

    // Initialize QuickBooks connection
    qboConnection = new QuickBooks(
      process.env.QB_CLIENT_ID,
      process.env.QB_CLIENT_SECRET,
      qboTokens.access_token,
      false, // no token secret for OAuth2
      qboTokens.realmId,
      process.env.QB_ENVIRONMENT === 'sandbox',
      true, // debug
      null, // minorversion
      '2.0', // oauthversion
      qboTokens.refresh_token
    );

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  if (!qboTokens.access_token) {
    return res.redirect('/auth/quickbooks');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API routes
app.get('/api/company_info', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.getCompanyInfo(qboTokens.realmId, (err, companyInfo) => {
    if (err) {
      return res.status(500).json({ error: err.message || 'Failed to get company info' });
    }
    res.json(companyInfo);
  });
});

// Forensic Analysis Routes

// Analyze transactions for duplicates
app.get('/api/forensics/duplicates', async (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  try {
    // Fetch recent transactions
    const query = "SELECT * FROM Purchase WHERE TxnDate >= '" + 
                  new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 
                  "' MAXRESULTS 1000";
    
    qboConnection.reportBalanceSheet({ realmID: qboTokens.realmId }, (err, transactions) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const duplicates = forensicAnalyzer.detectDuplicateTransactions(transactions?.Rows?.Row || []);
      res.json({ duplicates, count: duplicates.length });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Detect anomalies in transactions
app.get('/api/forensics/anomalies', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 500 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const anomalies = forensicAnalyzer.detectAnomalies(purchases?.QueryResponse?.Purchase || []);
    res.json({ anomalies, count: anomalies.length });
  });
});

// Analyze transaction patterns
app.get('/api/forensics/patterns', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 500 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const patterns = forensicAnalyzer.analyzeTransactionPatterns(purchases?.QueryResponse?.Purchase || []);
    res.json(patterns);
  });
});

// Generate compliance report
app.get('/api/forensics/compliance', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 500 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const report = forensicAnalyzer.generateComplianceReport(purchases?.QueryResponse?.Purchase || []);
    res.json(report);
  });
});

// Detect fraud indicators
app.get('/api/forensics/fraud-indicators', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  Promise.all([
    new Promise((resolve, reject) => {
      qboConnection.findPurchases({ limit: 500 }, (err, data) => {
        if (err) reject(err);
        else resolve(data?.QueryResponse?.Purchase || []);
      });
    }),
    new Promise((resolve, reject) => {
      qboConnection.findVendors({ limit: 100 }, (err, data) => {
        if (err) reject(err);
        else resolve(data?.QueryResponse?.Vendor || []);
      });
    })
  ])
  .then(([transactions, vendors]) => {
    const indicators = forensicAnalyzer.detectFraudIndicators(transactions, vendors);
    res.json(indicators);
  })
  .catch(error => {
    res.status(500).json({ error: error.message });
  });
});

// Generate audit trail
app.get('/api/forensics/audit-trail', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 500 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const trail = forensicAnalyzer.generateAuditTrail(purchases?.QueryResponse?.Purchase || []);
    res.json(trail);
  });
});

// Analytics Routes

// Cash flow forecast
app.get('/api/analytics/cash-flow-forecast', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  // Mock historical data for demonstration
  // In production, fetch from QuickBooks reports
  const historicalData = [10000, 12000, 11500, 13000, 14500, 15000];
  const forecast = analyticsEngine.forecastCashFlow(historicalData, 3);
  res.json(forecast);
});

// Expense category analysis
app.get('/api/analytics/expense-categories', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 500 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const expenses = (purchases?.QueryResponse?.Purchase || []).map(p => ({
      Category: p.AccountRef?.name || 'Uncategorized',
      Amount: p.TotalAmt,
      Date: p.TxnDate
    }));
    
    const analysis = analyticsEngine.analyzeExpenseCategories(expenses);
    res.json(analysis);
  });
});

// Vendor payment patterns
app.get('/api/analytics/vendor-patterns', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 500 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const analysis = analyticsEngine.analyzeVendorPatterns(purchases?.QueryResponse?.Purchase || []);
    res.json(analysis);
  });
});

// Customer payment behavior
app.get('/api/analytics/customer-behavior', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  Promise.all([
    new Promise((resolve, reject) => {
      qboConnection.findInvoices({ limit: 500 }, (err, data) => {
        if (err) reject(err);
        else resolve(data?.QueryResponse?.Invoice || []);
      });
    }),
    new Promise((resolve, reject) => {
      qboConnection.findPayments({ limit: 500 }, (err, data) => {
        if (err) reject(err);
        else resolve(data?.QueryResponse?.Payment || []);
      });
    })
  ])
  .then(([invoices, payments]) => {
    const analysis = analyticsEngine.analyzeCustomerBehavior(invoices, payments);
    res.json(analysis);
  })
  .catch(error => {
    res.status(500).json({ error: error.message });
  });
});

// A/R Aging Analysis
app.get('/api/analytics/ar-aging', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findInvoices({ limit: 500 }, (err, invoices) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const analysis = analyticsEngine.analyzeARAging(invoices?.QueryResponse?.Invoice || []);
    res.json(analysis);
  });
});

// A/P Aging Analysis
app.get('/api/analytics/ap-aging', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findBills({ limit: 500 }, (err, bills) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const analysis = analyticsEngine.analyzeAPAging(bills?.QueryResponse?.Bill || []);
    res.json(analysis);
  });
});

// Profit margin analysis
app.get('/api/analytics/profit-margins', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  Promise.all([
    new Promise((resolve, reject) => {
      qboConnection.findItems({ limit: 100 }, (err, data) => {
        if (err) reject(err);
        else resolve(data?.QueryResponse?.Item || []);
      });
    }),
    new Promise((resolve, reject) => {
      qboConnection.findInvoices({ limit: 500 }, (err, data) => {
        if (err) reject(err);
        else resolve(data?.QueryResponse?.Invoice || []);
      });
    })
  ])
  .then(([items, sales]) => {
    const analysis = analyticsEngine.analyzeProfitMargins(items, sales);
    res.json(analysis);
  })
  .catch(error => {
    res.status(500).json({ error: error.message });
  });
});

// Financial health score
app.get('/api/analytics/financial-health', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  // Fetch balance sheet data
  qboConnection.reportBalanceSheet({ realmID: qboTokens.realmId }, (err, report) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Extract financial data from balance sheet
    const financialData = {
      cashFlow: 15000, // Mock data - should be calculated from actual reports
      totalAssets: 100000,
      totalLiabilities: 40000,
      currentAssets: 60000,
      currentLiabilities: 25000
    };
    
    const healthScore = forensicAnalyzer.calculateFinancialHealthScore(financialData);
    res.json(healthScore);
  });
});

// Tax liability estimate
app.post('/api/analytics/tax-estimate', (req, res) => {
  const { income, expenses, taxRate } = req.body;
  
  if (!income || !expenses) {
    return res.status(400).json({ error: 'Income and expenses are required' });
  }
  
  const estimate = analyticsEngine.estimateTaxLiability(
    parseFloat(income),
    parseFloat(expenses),
    taxRate ? parseFloat(taxRate) : 0.21
  );
  
  res.json(estimate);
});

// Additional QuickBooks Data Routes

// Get customers
app.get('/api/customers', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findCustomers({ limit: 100 }, (err, customers) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(customers);
  });
});

// Get vendors
app.get('/api/vendors', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findVendors({ limit: 100 }, (err, vendors) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(vendors);
  });
});

// Get invoices
app.get('/api/invoices', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findInvoices({ limit: 100 }, (err, invoices) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(invoices);
  });
});

// Get bills
app.get('/api/bills', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findBills({ limit: 100 }, (err, bills) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(bills);
  });
});

// Get payments
app.get('/api/payments', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPayments({ limit: 100 }, (err, payments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(payments);
  });
});

// Get purchases
app.get('/api/purchases', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findPurchases({ limit: 100 }, (err, purchases) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(purchases);
  });
});

// Get items (products/services)
app.get('/api/items', (req, res) => {
  if (!qboConnection) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }

  qboConnection.findItems({ limit: 100 }, (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(items);
  });
});

// Token refresh route
app.get('/refresh_token', async (req, res) => {
  try {
    if (!qboTokens.refresh_token) {
      return res.status(401).json({ error: 'No refresh token available' });
    }

    const authResponse = await oauthClient.refreshUsingToken(qboTokens.refresh_token);
    qboTokens = {
      token_type: authResponse.token_type,
      access_token: authResponse.access_token,
      refresh_token: authResponse.refresh_token,
      expires_in: authResponse.expires_in,
      x_refresh_token_expires_in: authResponse.x_refresh_token_expires_in,
      realmId: qboTokens.realmId,
    };

    // Update QuickBooks connection
    qboConnection = new QuickBooks(
      process.env.QB_CLIENT_ID,
      process.env.QB_CLIENT_SECRET,
      qboTokens.access_token,
      false, // no token secret for OAuth2
      qboTokens.realmId,
      process.env.QB_ENVIRONMENT === 'sandbox',
      true, // debug
      null, // minorversion
      '2.0', // oauthversion
      qboTokens.refresh_token
    );

    res.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`OAuth callback URL: ${process.env.QB_REDIRECT_URI}`);
});
