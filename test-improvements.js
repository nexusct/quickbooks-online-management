/**
 * Test script to validate the 25 improvements (10 original + 15 new) made to the application
 * Run with: node test-improvements.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function test(name, assertion, expected) {
  if (assertion === expected) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    log(`✓ ${name}`, 'green');
    return true;
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL' });
    log(`✗ ${name} - Expected: ${expected}, Got: ${assertion}`, 'red');
    return false;
  }
}

function testFileExists(name, filePath) {
  const exists = fs.existsSync(filePath);
  test(name, exists, true);
  return exists;
}

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: endpoint.includes('/health') || endpoint.includes('/status') || endpoint.includes('/api') 
              ? JSON.parse(data) 
              : data,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  log('\n=== Testing 25 Improvements to QuickBooks Online Management ===\n', 'blue');
  log('Original 10 improvements + 15 new improvements\n', 'yellow');

  // Test 1: .gitignore exists
  log('Test 1: .gitignore file', 'yellow');
  testFileExists('✓ .gitignore exists', path.join(__dirname, '.gitignore'));

  // Test 2: README.md exists
  log('\nTest 2: README.md documentation', 'yellow');
  const readmeExists = testFileExists('✓ README.md exists', path.join(__dirname, 'README.md'));
  if (readmeExists) {
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    test('✓ README contains installation instructions', readme.includes('## Installation'), true);
    test('✓ README contains API documentation', readme.includes('## API Endpoints'), true);
  }

  // Test 3: dashboard.html exists
  log('\nTest 3: Dashboard HTML file', 'yellow');
  const dashboardExists = testFileExists('✓ dashboard.html exists', path.join(__dirname, 'public', 'dashboard.html'));
  if (dashboardExists) {
    const dashboard = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf8');
    test('✓ Dashboard uses secure DOM manipulation', !dashboard.includes('innerHTML = `${JSON.stringify'), true);
  }

  // Test 4: Error handling in index.js
  log('\nTest 4: Error handling middleware', 'yellow');
  const indexJs = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  test('✓ Global error handler exists', indexJs.includes('Global error handler'), true);
  test('✓ 404 handler exists', indexJs.includes('404 handler'), true);

  // Test 5: Security headers
  log('\nTest 5: Security headers', 'yellow');
  test('✓ Security headers middleware exists', indexJs.includes('X-Content-Type-Options'), true);
  test('✓ HSTS header configured', indexJs.includes('Strict-Transport-Security'), true);

  // Test 6: New API endpoints
  log('\nTest 6: Additional API endpoints', 'yellow');
  test('✓ Customers endpoint exists', indexJs.includes('/api/customers'), true);
  test('✓ Invoices endpoint exists', indexJs.includes('/api/invoices'), true);
  test('✓ Items endpoint exists', indexJs.includes('/api/items'), true);

  // Test 7: CORS configuration
  log('\nTest 7: CORS configuration', 'yellow');
  test('✓ CORS middleware exists', indexJs.includes('CORS configuration'), true);
  test('✓ CORS origin validation', indexJs.includes('new URL(origin)'), true);

  // Test 8: Token refresh
  log('\nTest 8: Automatic token refresh', 'yellow');
  test('✓ Token expiration check exists', indexJs.includes('isTokenExpired'), true);
  test('✓ ensureAuthenticated middleware exists', indexJs.includes('ensureAuthenticated'), true);

  // Test 9: Health & Status endpoints
  log('\nTest 9: Health and status endpoints', 'yellow');
  test('✓ Health endpoint exists', indexJs.includes('/health'), true);
  test('✓ Status endpoint exists', indexJs.includes('/api/status'), true);

  // Test 10: Documentation files
  log('\nTest 10: Comprehensive documentation', 'yellow');
  testFileExists('✓ CONTRIBUTING.md exists', path.join(__dirname, 'CONTRIBUTING.md'));
  testFileExists('✓ LICENSE exists', path.join(__dirname, 'LICENSE'));
  testFileExists('✓ SECURITY.md exists', path.join(__dirname, 'SECURITY.md'));
  testFileExists('✓ DEPLOYMENT.md exists', path.join(__dirname, 'DEPLOYMENT.md'));

  // === NEW IMPROVEMENTS (11-25) ===
  
  // Test 11: Rate limiting
  log('\nTest 11: Rate limiting middleware', 'yellow');
  test('✓ Rate limiting dependency exists', indexJs.includes("require('express-rate-limit')"), true);
  test('✓ Rate limiter configured', indexJs.includes('apiLimiter'), true);

  // Test 12: Request/Response logging
  log('\nTest 12: Request/Response logging', 'yellow');
  test('✓ Morgan logger dependency exists', indexJs.includes("require('morgan')"), true);
  test('✓ Morgan configured', indexJs.includes('morgan('), true);

  // Test 13: Environment validation
  log('\nTest 13: Environment variable validation', 'yellow');
  test('✓ Environment validation function exists', indexJs.includes('validateEnvironment'), true);
  test('✓ Required variables checked', indexJs.includes('QB_CLIENT_ID'), true);

  // Test 14: Graceful shutdown
  log('\nTest 14: Graceful shutdown handling', 'yellow');
  test('✓ Graceful shutdown function exists', indexJs.includes('gracefulShutdown'), true);
  test('✓ SIGTERM handler exists', indexJs.includes('SIGTERM'), true);
  test('✓ SIGINT handler exists', indexJs.includes('SIGINT'), true);

  // Test 15: Additional endpoints
  log('\nTest 15: Additional QuickBooks endpoints', 'yellow');
  test('✓ Vendors endpoint exists', indexJs.includes('/api/vendors'), true);
  test('✓ Accounts endpoint exists', indexJs.includes('/api/accounts'), true);
  test('✓ Payments endpoint exists', indexJs.includes('/api/payments'), true);

  // Test 16: Request ID tracking
  log('\nTest 16: Request ID tracking', 'yellow');
  test('✓ UUID dependency exists', indexJs.includes("require('uuid')"), true);
  test('✓ Request ID middleware exists', indexJs.includes('X-Request-ID'), true);

  // Test 17: Compression
  log('\nTest 17: Response compression', 'yellow');
  test('✓ Compression dependency exists', indexJs.includes("require('compression')"), true);
  test('✓ Compression middleware configured', indexJs.includes('compression()'), true);

  // Test 18: Caching
  log('\nTest 18: Caching layer', 'yellow');
  test('✓ Node-cache dependency exists', indexJs.includes("require('node-cache')"), true);
  test('✓ Cache instance created', indexJs.includes('new NodeCache'), true);

  // Test 19: Docker
  log('\nTest 19: Docker configuration', 'yellow');
  testFileExists('✓ Dockerfile exists', path.join(__dirname, 'Dockerfile'));
  testFileExists('✓ docker-compose.yml exists', path.join(__dirname, 'docker-compose.yml'));
  testFileExists('✓ .dockerignore exists', path.join(__dirname, '.dockerignore'));

  // Test 20: CI/CD
  log('\nTest 20: CI/CD pipeline', 'yellow');
  testFileExists('✓ GitHub Actions workflow exists', path.join(__dirname, '.github', 'workflows', 'ci-cd.yml'));

  // Test 21: Webhooks
  log('\nTest 21: Webhooks support', 'yellow');
  test('✓ Crypto module imported', indexJs.includes("require('crypto')"), true);
  test('✓ Webhook endpoint exists', indexJs.includes('/webhooks/quickbooks'), true);
  test('✓ Signature verification exists', indexJs.includes('intuit-signature'), true);

  // Test 22: API Documentation
  log('\nTest 22: API documentation (Swagger)', 'yellow');
  test('✓ Swagger UI dependency exists', indexJs.includes("require('swagger-ui-express')"), true);
  test('✓ Swagger JSDoc dependency exists', indexJs.includes("require('swagger-jsdoc')"), true);
  test('✓ API docs endpoint exists', indexJs.includes('/api-docs'), true);

  // Test 23: API Versioning
  log('\nTest 23: API versioning', 'yellow');
  test('✓ v1 router exists', indexJs.includes('v1Router'), true);
  test('✓ v1 routes mounted', indexJs.includes('/api/v1'), true);

  // Test 24: Additional documentation
  log('\nTest 24: Additional documentation', 'yellow');
  testFileExists('✓ IMPROVEMENTS_ADDITIONAL.md exists', path.join(__dirname, 'IMPROVEMENTS_ADDITIONAL.md'));

  // Test 25: Package.json updates
  log('\nTest 25: Package.json enhancements', 'yellow');
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  test('✓ Docker scripts added', 'docker:build' in packageJson.scripts, true);
  test('✓ Version updated', packageJson.version >= '1.2.0', true);

  // Additional validation tests
  log('\nAdditional Validation Tests:', 'yellow');
  test('✓ Pagination validation function exists', indexJs.includes('parsePaginationParams'), true);
  test('✓ Token update helper exists', indexJs.includes('updateTokens'), true);

  // Summary
  log('\n=== Test Summary ===', 'blue');
  log(`Total Tests: ${results.passed + results.failed}`);
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(2)}%\n`, 'blue');

  // Runtime tests (only if server is running)
  log('=== Runtime Tests (requires running server) ===', 'yellow');
  log(`Attempting to connect to ${BASE_URL}...\n`, 'blue');

  try {
    const healthResponse = await makeRequest('/health');
    test('✓ Health endpoint returns 200', healthResponse.statusCode, 200);
    test('✓ Health endpoint returns status', healthResponse.body.status, 'healthy');

    const statusResponse = await makeRequest('/api/status');
    test('✓ Status endpoint returns 200', statusResponse.statusCode, 200);
    test('✓ Status endpoint has authenticated field', 'authenticated' in statusResponse.body, true);

    const homeResponse = await makeRequest('/');
    test('✓ Home page accessible', homeResponse.statusCode, 200);
    test('✓ Security header X-Content-Type-Options present', !!homeResponse.headers['x-content-type-options'], true);

    const notFoundResponse = await makeRequest('/nonexistent');
    test('✓ 404 handler works', notFoundResponse.statusCode, 404);

    log('\n=== Final Summary ===', 'blue');
    log(`Total Tests: ${results.passed + results.failed}`);
    log(`Passed: ${results.passed}`, 'green');
    log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
    log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(2)}%\n`, 'blue');

    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    log(`\nNote: Runtime tests skipped - server not running on port ${PORT}`, 'yellow');
    log('To run runtime tests, start the server with: npm start\n', 'yellow');
    process.exit(results.failed > 0 ? 1 : 0);
  }
}

// Run tests
runTests().catch((error) => {
  log(`\nTest runner error: ${error.message}`, 'red');
  process.exit(1);
});
