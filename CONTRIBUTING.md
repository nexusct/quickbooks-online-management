# Contributing to QuickBooks Online Management

Thank you for your interest in contributing to QuickBooks Online Management! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/quickbooks-online-management.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit your changes: `git commit -m 'Add some feature'`
7. Push to the branch: `git push origin feature/your-feature-name`
8. Open a Pull Request

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables:
```bash
cp .env.example .env
# Edit .env with your QuickBooks credentials
```

3. Start the development server:
```bash
npm run dev
```

## Code Style

- Use meaningful variable and function names
- Add comments for complex logic
- Follow existing code patterns and conventions
- Keep functions small and focused
- Use async/await for asynchronous operations

## Commit Messages

- Use clear and descriptive commit messages
- Start with a verb in present tense (Add, Fix, Update, Remove, etc.)
- Keep the first line under 50 characters
- Add a detailed description if necessary

Examples:
```
Add customer search functionality
Fix token refresh error handling
Update README with deployment instructions
```

## Pull Request Guidelines

- Ensure your code follows the project's code style
- Update documentation if you're adding new features
- Add or update tests if applicable
- Ensure all tests pass
- Keep pull requests focused on a single feature or fix
- Reference any related issues in your PR description

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Your environment (OS, Node version, etc.)
- Any relevant error messages or logs

## Feature Requests

We welcome feature requests! When submitting a feature request:

- Describe the feature and its use case
- Explain why this feature would be useful
- Provide examples if possible

## Security Vulnerabilities

If you discover a security vulnerability, please email the maintainers directly instead of opening a public issue. We take security seriously and will respond promptly.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

## Questions?

If you have questions about contributing, feel free to open an issue with the "question" label.

Thank you for contributing! 🎉
