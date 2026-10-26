# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within QuickBooks Online Management, please send an email to the project maintainers at the repository owner's email (available in git commit history). All security vulnerabilities will be promptly addressed.

**Please do not open public issues for security vulnerabilities.**

## Current Security Status

### ✅ Resolved Issues (as of this commit)

1. **Dependency Vulnerabilities** - All 18+ npm audit vulnerabilities have been resolved:
   - axios: Updated to latest version with all security patches
   - form-data: Updated to secure version
   - brace-expansion: Updated to fix DoS vulnerabilities
   - fast-xml-parser: Forced to v5.7.0+ via npm overrides
   - underscore: Forced to v1.13.8+ via npm overrides
   - uuid: Forced to v11.1.1+ via npm overrides
   - Other transitive dependencies: Updated via npm audit fix

2. **node_modules in Git** - Removed from git tracking to prevent:
   - Repository bloat
   - Exposure of dependency vulnerabilities in git history
   - Merge conflicts on dependency updates

3. **package-lock.json in Git** - Removed from git tracking per repository security policy

### ⚠️ Active Alerts Requiring Owner Action

1. **Google API Key Exposure (Secret Scanning Alert #1)**
   - **Status**: KEY REMOVED from repository but still requires rotation
   - **Exposed Key**: `AIzaSyAd72xUaF049-dbkwTAfSvsjQhmp9YLDpk`
   - **Location**: Previously in `.pre-commit-config.yaml` (removed in commit b52b25b)
   - **Impact**: Key was visible in public git history
   - **Required Action**: Repository owner MUST rotate this key at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - **Timeline**: Immediate - key should be considered compromised

### Security Best Practices

When deploying this application:

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use secure secret management systems in production:
     - AWS: AWS Secrets Manager or AWS Systems Manager Parameter Store
     - Azure: Azure Key Vault
     - Google Cloud: Google Secret Manager
     - Generic: HashiCorp Vault
   - Rotate credentials regularly (recommended: every 90 days minimum)
   - Use different credentials for development, staging, and production

2. **Git Hygiene**
   - Review all files before committing to ensure no secrets are included
   - Use pre-commit hooks to prevent secret commits (`.pre-commit-config.yaml` is configured)
   - If a secret is ever committed:
     1. Rotate the secret immediately
     2. Remove it from git history (use `git filter-repo` or similar)
     3. Force push to all remotes
     4. Notify affected services
   - Keep `node_modules/` and `package-lock.json` out of git (already in `.gitignore`)

3. **HTTPS/TLS**
   - Always use HTTPS in production
   - Use valid SSL/TLS certificates (Let's Encrypt, commercial CA, or cloud provider)
   - Configure proper cipher suites
   - Enable HSTS (Strict-Transport-Security header is already implemented)

4. **Authentication & Authorization**
   - Implement rate limiting on authentication endpoints (not yet implemented - see Future Improvements)
   - Monitor for suspicious authentication patterns
   - Use short-lived tokens where possible
   - QuickBooks tokens automatically refresh when needed

5. **Network Security**
   - Use firewalls to restrict access
   - Implement DDoS protection (cloud provider level)
   - Use WAF (Web Application Firewall) in production
   - Configure `ALLOWED_ORIGINS` environment variable to restrict CORS (never use `*` in production)

6. **Data Protection**
   - Never log sensitive data (tokens, credentials, passwords) - already implemented
   - Implement proper session management
   - Use secure token storage (database with encryption for production, not in-memory)
   - Consider encrypting sensitive data at rest

7. **Dependencies**
   - Regularly run `npm audit` (configured as `npm run security-check`)
   - Keep dependencies updated with `npm update`
   - Monitor security advisories: `npm audit` or GitHub Dependabot
   - Use `npm overrides` to force secure versions when needed (already implemented)

8. **Input Validation**
   - Validate all user inputs (basic validation implemented)
   - Sanitize data before processing
   - Use parameterized queries if adding database functionality
   - Implement request size limits (already implemented via body-parser)

## Security Headers

This application implements the following security headers:

- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking attacks
- `X-XSS-Protection: 1; mode=block` - Enables XSS filtering
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` - Enforces HTTPS connections

## CORS Configuration

The application includes CORS configuration that restricts origins to a whitelist. Configure allowed origins via the `ALLOWED_ORIGINS` environment variable (comma-separated list). 

**Default**: `http://localhost:3000` (development only)

**Production Example**: `ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com`

**Never use wildcard (`*`) origins in production.**

## Automatic Token Refresh

The application includes automatic token refresh to minimize the risk of expired tokens. Tokens are checked before each API call and refreshed if needed (5-minute buffer before expiration).

## Current Security Implementations

✅ Security headers (X-Frame-Options, X-Content-Type-Options, etc.)  
✅ CORS origin validation with configurable whitelist  
✅ Input validation for pagination parameters  
✅ Automatic token refresh with expiration checking  
✅ Error handling without sensitive data exposure  
✅ No logging of tokens or credentials  
✅ Environment variable configuration for all secrets  
✅ Pre-commit hooks for secret detection  

## Future Security Improvements

Planned security enhancements:

1. Rate limiting middleware for API endpoints
2. Implementation of token encryption at rest
3. Migration away from in-memory token storage to encrypted database storage
4. Implementation of request signing
5. Addition of API key authentication for multi-user scenarios
6. Implementation of comprehensive audit logging
7. Addition of intrusion detection/prevention
8. Database query parameterization when database features are added
9. Content Security Policy (CSP) headers

## Security Update Policy

We aim to address:
- Critical vulnerabilities: within 24-48 hours
- High severity vulnerabilities: within 1 week
- Moderate severity vulnerabilities: within 2 weeks
- Low severity vulnerabilities: in the next scheduled release

## Contact

For security concerns, please contact the maintainers directly rather than opening public issues.
