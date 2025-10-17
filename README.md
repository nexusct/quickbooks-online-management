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
- npm or yarn
- QuickBooks Online Developer Account
- QuickBooks Online App Credentials (Client ID and Secret)

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

## Security Considerations

- Never commit your `.env` file to version control
- Use HTTPS in production
- Regularly rotate your QuickBooks credentials
- Keep dependencies updated
- Use environment-specific configurations

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

```bash
npm test
```

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
