require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Store server start time for uptime calculation
const serverStartTime = Date.now();

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// CORS configuration for multi-cloud deployment
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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

// Helper function to check if token is expired
function isTokenExpired() {
  if (!qboTokens.expires_in || !qboTokens.token_created_at) {
    return true;
  }
  const expirationTime = qboTokens.token_created_at + (qboTokens.expires_in * 1000);
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  return Date.now() >= (expirationTime - bufferTime);
}

// Middleware to check authentication and refresh token if needed
async function ensureAuthenticated(req, res, next) {
  if (!qboTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated with QuickBooks' });
  }
  
  try {
    if (isTokenExpired() && qboTokens.refresh_token) {
      console.log('Token expired, refreshing...');
      const authResponse = await oauthClient.refreshUsingToken(qboTokens.refresh_token);
      updateTokens(authResponse);
    }
    next();
  } catch (error) {
    console.error('Error checking authentication:', error);
    return res.status(401).json({ error: 'Authentication check failed' });
  }
}

// Helper function to update tokens
function updateTokens(authResponse) {
  qboTokens = {
    token_type: authResponse.token_type,
    access_token: authResponse.access_token,
    refresh_token: authResponse.refresh_token,
    expires_in: authResponse.expires_in,
    x_refresh_token_expires_in: authResponse.x_refresh_token_expires_in,
    realmId: qboTokens.realmId || authResponse.realmId,
    token_created_at: Date.now(),
  };

  // Update QuickBooks connection
  qboConnection = new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    qboTokens.access_token,
    false,
    qboTokens.realmId,
    process.env.QB_ENVIRONMENT === 'sandbox',
    true,
    null,
    '2.0',
    qboTokens.refresh_token
  );
}

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
      token_created_at: Date.now(),
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.QB_ENVIRONMENT || 'sandbox',
  });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    authenticated: !!qboTokens.access_token,
    realmId: qboTokens.realmId || null,
    tokenExpired: isTokenExpired(),
    environment: process.env.QB_ENVIRONMENT || 'sandbox',
  });
});

// API routes with authentication middleware
app.get('/api/company_info', ensureAuthenticated, (req, res) => {
  qboConnection.getCompanyInfo(qboTokens.realmId, (err, companyInfo) => {
    if (err) {
      console.error('Error getting company info:', err);
      return res.status(500).json({ error: err.message || 'Failed to get company info' });
    }
    res.json(companyInfo);
  });
});

// Get customers
app.get('/api/customers', ensureAuthenticated, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const offset = parseInt(req.query.offset) || 1;
  
  qboConnection.findCustomers({ limit, offset }, (err, customers) => {
    if (err) {
      console.error('Error getting customers:', err);
      return res.status(500).json({ error: err.message || 'Failed to get customers' });
    }
    res.json(customers);
  });
});

// Get invoices
app.get('/api/invoices', ensureAuthenticated, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const offset = parseInt(req.query.offset) || 1;
  
  qboConnection.findInvoices({ limit, offset }, (err, invoices) => {
    if (err) {
      console.error('Error getting invoices:', err);
      return res.status(500).json({ error: err.message || 'Failed to get invoices' });
    }
    res.json(invoices);
  });
});

// Get items/products
app.get('/api/items', ensureAuthenticated, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const offset = parseInt(req.query.offset) || 1;
  
  qboConnection.findItems({ limit, offset }, (err, items) => {
    if (err) {
      console.error('Error getting items:', err);
      return res.status(500).json({ error: err.message || 'Failed to get items' });
    }
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
    updateTokens(authResponse);

    res.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`OAuth callback URL: ${process.env.QB_REDIRECT_URI}`);
  console.log(`Environment: ${process.env.QB_ENVIRONMENT || 'sandbox'}`);
  console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
});
