require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
function validateEnvironment() {
  const required = ['QB_CLIENT_ID', 'QB_CLIENT_SECRET', 'QB_REDIRECT_URI'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Please check your .env file');
    process.exit(1);
  }
  
  // Validate QB_ENVIRONMENT
  const validEnvironments = ['sandbox', 'production'];
  if (process.env.QB_ENVIRONMENT && !validEnvironments.includes(process.env.QB_ENVIRONMENT)) {
    console.error(`Invalid QB_ENVIRONMENT: ${process.env.QB_ENVIRONMENT}. Must be 'sandbox' or 'production'`);
    process.exit(1);
  }
}

validateEnvironment();

// Store server start time for uptime calculation
const serverStartTime = Date.now();

// Initialize cache (TTL: 5 minutes)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'QuickBooks Online Management API',
      version: '1.1.0',
      description: 'A Multi-Cloud Proxy for managing QuickBooks Online with OAuth 2.0 authentication',
      contact: {
        name: 'API Support',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'OAuth 2.0 authentication endpoints',
      },
      {
        name: 'QuickBooks API',
        description: 'QuickBooks Online data access endpoints',
      },
      {
        name: 'System',
        description: 'System health and status endpoints',
      },
      {
        name: 'Webhooks',
        description: 'QuickBooks webhook endpoints',
      },
    ],
  },
  apis: ['./index.js'], // Path to the API routes
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

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
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(origin => {
        // Basic URL validation
        try {
          new URL(origin);
          return true;
        } catch (e) {
          console.error(`Invalid origin in ALLOWED_ORIGINS: ${origin}`);
          return false;
        }
      })
    : ['http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
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
app.use(compression()); // Enable gzip compression
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request ID tracking middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);
app.use('/api/v1/', apiLimiter);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'QuickBooks Online API Docs',
}));

// API Versioning - Create router for v1
const v1Router = express.Router();

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
/**
 * @swagger
 * /:
 *   get:
 *     summary: Home page
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Returns the home page HTML
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start OAuth flow
/**
 * @swagger
 * /auth/quickbooks:
 *   get:
 *     summary: Initiate QuickBooks OAuth 2.0 flow
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to QuickBooks authorization page
 */
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
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 uptime:
 *                   type: number
 *                   example: 12345
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: sandbox
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.QB_ENVIRONMENT || 'sandbox',
  });
});

// Status endpoint
/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: Get authentication status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Authentication status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authenticated:
 *                   type: boolean
 *                 realmId:
 *                   type: string
 *                 tokenExpired:
 *                   type: boolean
 *                 environment:
 *                   type: string
 */
app.get('/api/status', (req, res) => {
  res.json({
    authenticated: !!qboTokens.access_token,
    realmId: qboTokens.realmId || null,
    tokenExpired: isTokenExpired(),
    environment: process.env.QB_ENVIRONMENT || 'sandbox',
  });
});

// API routes with authentication middleware
/**
 * @swagger
 * /api/company_info:
 *   get:
 *     summary: Get company information
 *     tags: [QuickBooks API]
 *     security:
 *       - OAuth2: []
 *     responses:
 *       200:
 *         description: Company information
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
app.get('/api/company_info', ensureAuthenticated, (req, res) => {
  const cacheKey = `company_info_${qboTokens.realmId}`;
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    console.log('Returning cached company info');
    return res.json(cachedData);
  }
  
  qboConnection.getCompanyInfo(qboTokens.realmId, (err, companyInfo) => {
    if (err) {
      console.error('Error getting company info:', err);
      return res.status(500).json({ error: err.message || 'Failed to get company info' });
    }
    cache.set(cacheKey, companyInfo);
    res.json(companyInfo);
  });
});

// Helper function to validate and parse pagination parameters
function parsePaginationParams(query) {
  const limitParam = parseInt(query.limit);
  const offsetParam = parseInt(query.offset);
  
  const limit = (limitParam && limitParam > 0 && limitParam <= 100) ? limitParam : 10;
  const offset = (offsetParam && offsetParam > 0) ? offsetParam : 1;
  
  return { limit, offset };
}

// Get customers
app.get('/api/customers', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  
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
  const { limit, offset } = parsePaginationParams(req.query);
  
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
  const { limit, offset } = parsePaginationParams(req.query);
  
  qboConnection.findItems({ limit, offset }, (err, items) => {
    if (err) {
      console.error('Error getting items:', err);
      return res.status(500).json({ error: err.message || 'Failed to get items' });
    }
    res.json(items);
  });
});

// Get vendors
app.get('/api/vendors', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  
  qboConnection.findVendors({ limit, offset }, (err, vendors) => {
    if (err) {
      console.error('Error getting vendors:', err);
      return res.status(500).json({ error: err.message || 'Failed to get vendors' });
    }
    res.json(vendors);
  });
});

// Get accounts
app.get('/api/accounts', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  
  qboConnection.findAccounts({ limit, offset }, (err, accounts) => {
    if (err) {
      console.error('Error getting accounts:', err);
      return res.status(500).json({ error: err.message || 'Failed to get accounts' });
    }
    res.json(accounts);
  });
});

// Get payments
app.get('/api/payments', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  
  qboConnection.findPayments({ limit, offset }, (err, payments) => {
    if (err) {
      console.error('Error getting payments:', err);
      return res.status(500).json({ error: err.message || 'Failed to get payments' });
    }
    res.json(payments);
  });
});

// Mount v1 API routes (versioned endpoints)
v1Router.get('/company_info', ensureAuthenticated, (req, res) => {
  const cacheKey = `company_info_${qboTokens.realmId}`;
  const cachedData = cache.get(cacheKey);
  
  if (cachedData) {
    console.log('Returning cached company info (v1)');
    return res.json(cachedData);
  }
  
  qboConnection.getCompanyInfo(qboTokens.realmId, (err, companyInfo) => {
    if (err) {
      console.error('Error getting company info:', err);
      return res.status(500).json({ error: err.message || 'Failed to get company info' });
    }
    cache.set(cacheKey, companyInfo);
    res.json(companyInfo);
  });
});

v1Router.get('/customers', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  qboConnection.findCustomers({ limit, offset }, (err, customers) => {
    if (err) {
      console.error('Error getting customers:', err);
      return res.status(500).json({ error: err.message || 'Failed to get customers' });
    }
    res.json(customers);
  });
});

v1Router.get('/invoices', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  qboConnection.findInvoices({ limit, offset }, (err, invoices) => {
    if (err) {
      console.error('Error getting invoices:', err);
      return res.status(500).json({ error: err.message || 'Failed to get invoices' });
    }
    res.json(invoices);
  });
});

v1Router.get('/items', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  qboConnection.findItems({ limit, offset }, (err, items) => {
    if (err) {
      console.error('Error getting items:', err);
      return res.status(500).json({ error: err.message || 'Failed to get items' });
    }
    res.json(items);
  });
});

v1Router.get('/vendors', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  qboConnection.findVendors({ limit, offset }, (err, vendors) => {
    if (err) {
      console.error('Error getting vendors:', err);
      return res.status(500).json({ error: err.message || 'Failed to get vendors' });
    }
    res.json(vendors);
  });
});

v1Router.get('/accounts', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  qboConnection.findAccounts({ limit, offset }, (err, accounts) => {
    if (err) {
      console.error('Error getting accounts:', err);
      return res.status(500).json({ error: err.message || 'Failed to get accounts' });
    }
    res.json(accounts);
  });
});

v1Router.get('/payments', ensureAuthenticated, (req, res) => {
  const { limit, offset } = parsePaginationParams(req.query);
  qboConnection.findPayments({ limit, offset }, (err, payments) => {
    if (err) {
      console.error('Error getting payments:', err);
      return res.status(500).json({ error: err.message || 'Failed to get payments' });
    }
    res.json(payments);
  });
});

// Mount v1 router
app.use('/api/v1', v1Router);

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

// Webhook endpoint for QuickBooks events
app.post('/webhooks/quickbooks', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    // Verify webhook signature if webhook verifier token is set
    const webhookToken = process.env.QB_WEBHOOK_VERIFIER_TOKEN;
    
    if (webhookToken) {
      const signature = req.headers['intuit-signature'];
      const payload = req.body.toString();
      
      // Create HMAC SHA256 hash
      const hash = crypto
        .createHmac('sha256', webhookToken)
        .update(payload)
        .digest('base64');
      
      if (hash !== signature) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }
    
    // Parse the webhook payload
    const webhookPayload = JSON.parse(req.body);
    
    // Log webhook event
    console.log('Webhook received:', {
      eventNotifications: webhookPayload.eventNotifications?.length || 0,
      timestamp: new Date().toISOString(),
    });
    
    // Process webhook events
    if (webhookPayload.eventNotifications) {
      webhookPayload.eventNotifications.forEach(event => {
        console.log('Event:', {
          realmId: event.realmId,
          dataChangeEvent: event.dataChangeEvent,
        });
        
        // Clear cache when data changes
        if (event.dataChangeEvent?.entities) {
          event.dataChangeEvent.entities.forEach(entity => {
            console.log(`Data changed: ${entity.name} - ${entity.operation}`);
            // Clear relevant cache
            cache.flushAll();
          });
        }
      });
    }
    
    // QuickBooks expects 200 response
    res.status(200).send();
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error without sensitive information
  console.error('Unhandled error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
  });
  
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
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`OAuth callback URL: ${process.env.QB_REDIRECT_URI}`);
  console.log(`Environment: ${process.env.QB_ENVIRONMENT || 'sandbox'}`);
  console.log(`Node Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`\n${signal} received, starting graceful shutdown...`);
  
  server.close(() => {
    console.log('HTTP server closed');
    console.log('Graceful shutdown completed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
