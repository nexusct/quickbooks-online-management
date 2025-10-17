# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within QuickBooks Online Management, please send an email to the project maintainers. All security vulnerabilities will be promptly addressed.

**Please do not open public issues for security vulnerabilities.**

## Known Security Issues

### Current Dependencies

This project currently has some dependencies with known security issues:

1. **node-quickbooks** - Depends on deprecated `request` module which has vulnerabilities in:
   - `form-data` (critical) - Uses unsafe random function for boundary selection
   - `tough-cookie` (moderate) - Prototype Pollution vulnerability

**Mitigation Steps:**
- These vulnerabilities are in the `node-quickbooks` dependency which we rely on for QuickBooks API integration
- The vulnerabilities are primarily related to the deprecated `request` library
- We are monitoring for updates to `node-quickbooks` that will replace the `request` dependency
- For production use, implement additional security layers (see recommendations below)

### Security Best Practices

When deploying this application:

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use secure secret management systems in production (AWS Secrets Manager, Azure Key Vault, etc.)
   - Rotate credentials regularly

2. **HTTPS/TLS**
   - Always use HTTPS in production
   - Use valid SSL/TLS certificates
   - Configure proper cipher suites

3. **Authentication & Authorization**
   - Implement rate limiting on authentication endpoints
   - Monitor for suspicious authentication patterns
   - Use short-lived tokens where possible

4. **Network Security**
   - Use firewalls to restrict access
   - Implement DDoS protection
   - Use WAF (Web Application Firewall) in production

5. **Data Protection**
   - Never log sensitive data (tokens, credentials)
   - Implement proper session management
   - Use secure token storage (database with encryption, not in-memory for production)

6. **Dependencies**
   - Regularly run `npm audit`
   - Keep dependencies updated
   - Monitor security advisories for used packages

7. **Input Validation**
   - Validate all user inputs
   - Sanitize data before processing
   - Use parameterized queries if adding database functionality

8. **Logging & Monitoring**
   - Log all authentication attempts
   - Monitor for unusual API usage patterns
   - Set up alerts for security events

## Security Headers

This application implements the following security headers:

- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking attacks
- `X-XSS-Protection: 1; mode=block` - Enables XSS filtering
- `Strict-Transport-Security` - Enforces HTTPS connections

## CORS Configuration

The application includes CORS configuration that can be customized via the `ALLOWED_ORIGINS` environment variable. In production, restrict this to your specific domains.

## Automatic Token Refresh

The application includes automatic token refresh to minimize the risk of expired tokens. Tokens are checked before each API call and refreshed if needed.

## Future Security Improvements

Planned security enhancements:

1. Migration away from `node-quickbooks` to a more maintained library or direct API calls
2. Implementation of token encryption at rest
3. Addition of rate limiting middleware
4. Implementation of request signing
5. Addition of API key authentication for multi-user scenarios
6. Implementation of audit logging

## Security Update Policy

We aim to address:
- Critical vulnerabilities: within 24-48 hours
- High severity vulnerabilities: within 1 week
- Moderate severity vulnerabilities: within 2 weeks
- Low severity vulnerabilities: in the next scheduled release

## Contact

For security concerns, please contact the maintainers directly rather than opening public issues.
