require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const OAuthClient = require('intuit-oauth');
const QuickBooks = require('node-quickbooks');

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

// Add more API routes as needed for different QuickBooks resources

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
