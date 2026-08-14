# QuickBooks Online Management

A Multi-Cloud Proxy for managing QuickBooks Online with OAuth 2.0 authentication GUI. This application provides a secure and user-friendly interface to connect and interact with QuickBooks Online API.

## Features

- 🔐 OAuth 2.0 Authentication with QuickBooks Online
- 🔄 Automatic Token Refresh
- 📊 Company Information Retrieval
- 🌐 RESTful API Endpoints
- 🛡️ Security Headers and Input Validation
- 📝 Comprehensive Error Handling
- 💾 Health Check and Status Endpoints

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- QuickBooks Online Developer Account (create at [Intuit Developer Portal](https://developer.intuit.com/))
- QuickBooks Online App Credentials (Client ID and Secret)

## Required Environment Variables

This application requires the following environment variables to be configured:

| Variable | Required | Description | Example Value |
|----------|----------|-------------|---------------|
| `QB_CLIENT_ID` | Yes | Your QuickBooks Client ID from Intuit Developer Portal | `ABxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `QB_CLIENT_SECRET` | Yes | Your QuickBooks Client Secret (keep secret!) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `QB_REDIRECT_URI` | Yes | OAuth callback URL (must match Intuit app settings) | `http://localhost:3000/callback` |
| `QB_ENVIRONMENT` | Yes | QuickBooks environment: `sandbox` or `production` | `sandbox` |
| `PORT` | No | Server port (defaults to 3000) | `3000` |
| `NODE_ENV` | No | Node environment: `development` or `production` | `development` |
| `ALLOWED_ORIGINS` | No | Comma-separated list of allowed CORS origins | `http://localhost:3000,https://yourdomain.com` |

**IMPORTANT:** Never commit real credentials to version control. Use environment variables or a secrets manager.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/nexusct/quickbooks-online-management.git
cd quickbooks-online-management
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your QuickBooks credentials:
```
QB_CLIENT_ID=your_client_id_here
QB_CLIENT_SECRET=your_client_secret_here
QB_REDIRECT_URI=http://localhost:3000/callback
QB_ENVIRONMENT=sandbox
PORT=3000
NODE_ENV=development
```

## Getting QuickBooks Credentials

1. Visit [Intuit Developer Portal](https://developer.intuit.com/)
2. Sign in or create an account
3. Create a new app
4. Get your Client ID and Client Secret
5. Set the Redirect URI to match your configuration

## Usage

### Development Mode

Run with auto-reload on file changes:
```bash
npm run dev
```

### Production Mode

Run the application:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Endpoints

### Authentication

- `GET /auth/quickbooks` - Initiates OAuth flow
- `GET /callback` - OAuth callback handler
- `GET /refresh_token` - Refreshes access token

### QuickBooks Resources

- `GET /api/company_info` - Get company information
- `GET /api/customers` - List all customers
- `GET /api/invoices` - List all invoices
- `GET /api/items` - List all items/products

### System

- `GET /` - Home page
- `GET /dashboard` - Dashboard (requires authentication)
- `GET /health` - Health check endpoint
- `GET /api/status` - Connection status

## Security

### Critical Security Practices

1. **Never Commit Secrets**
   - Never commit `.env` files, credentials, or API keys to git
   - Use `.gitignore` to exclude sensitive files (already configured)
   - Review git history before making repositories public

2. **Credential Management**
   - Store all secrets in environment variables
   - Use secret management services in production (AWS Secrets Manager, Azure Key Vault, Google Secret Manager)
   - Rotate credentials regularly (at least every 90 days)
   - If credentials are ever exposed in git history, rotate them immediately

3. **HTTPS/TLS**
   - Always use HTTPS in production
   - Use valid SSL/TLS certificates
   - Configure proper cipher suites

4. **CORS Configuration**
   - Configure `ALLOWED_ORIGINS` to restrict allowed domains
   - Never use wildcard (`*`) origins in production
   - Validate all origins against a whitelist

5. **Dependency Security**
   - Run `npm audit` regularly to check for vulnerabilities
   - Keep all dependencies updated with `npm update`
   - Review security advisories for critical dependencies

6. **Additional Security Measures**
   - Implement rate limiting on authentication endpoints
   - Use short-lived tokens where possible
   - Enable logging and monitoring for security events
   - Never log sensitive data (tokens, credentials, passwords)

For detailed security information, see [SECURITY.md](SECURITY.md).

### Known Security Alerts

**Google API Key Exposure (Alert #1):**
A Google API key (`AIzaSyAd72xUaF049-dbkwTAfSvsjQhmp9YLDpk`) was previously committed to the repository in `.pre-commit-config.yaml` and has been removed as of commit b52b25b. **This key must be rotated immediately** in the Google Cloud Console. The key was exposed in the public git history and should be considered compromised.

**Action Required:** Repository owner must rotate the exposed Google API key at [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

## Multi-Cloud Deployment

This application is designed to work across multiple cloud providers:

- AWS (Elastic Beanstalk, Lambda)
- Google Cloud Platform (App Engine, Cloud Run)
- Azure (App Service)
- Heroku
- DigitalOcean App Platform

### Environment Variables for Production

Make sure to set these environment variables in your cloud platform:
- `QB_CLIENT_ID`
- `QB_CLIENT_SECRET`
- `QB_REDIRECT_URI`
- `QB_ENVIRONMENT`
- `PORT` (if not auto-assigned)

## Error Handling

The application includes comprehensive error handling for:
- Authentication failures
- API request errors
- Token expiration
- Network issues
- Invalid requests

## Development

### Project Structure

```
quickbooks-online-management/
├── index.js              # Main application file
├── public/               # Static files
│   ├── index.html       # Home page
│   └── dashboard.html   # Dashboard page
├── package.json         # Dependencies
├── .env.example         # Environment template
└── README.md           # Documentation
```

### Running Tests

The project includes a test suite to validate all improvements:

```bash
# Run tests (without server)
npm test

# Run tests with a running server for full validation
npm start  # In one terminal
npm test   # In another terminal
```

The test suite validates:
- File structure and documentation
- Security implementations
- API endpoints
- Error handling
- Configuration

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Open an issue on GitHub
- Check [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account)
- Review [Intuit OAuth 2.0 Documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)

## Acknowledgments

- [Intuit QuickBooks API](https://developer.intuit.com/)
- [node-quickbooks](https://github.com/mcohen01/node-quickbooks)
- [intuit-oauth](https://github.com/intuit/oauth-jsclient)

## Changelog

### Version 1.0.0
- Initial release
- OAuth 2.0 authentication
- Basic API endpoints
- Dashboard interface
