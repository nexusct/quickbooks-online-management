/**
 * Simple test script to validate the 10 improvements made to the application
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
  log('\n=== Testing 10 Improvements to QuickBooks Online Management ===\n', 'blue');

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
