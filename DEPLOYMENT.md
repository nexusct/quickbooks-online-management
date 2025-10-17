# Deployment Guide

This guide covers deployment of QuickBooks Online Management to various cloud platforms.

## General Prerequisites

Before deploying to any platform:

1. Have your QuickBooks API credentials ready
2. Update your QuickBooks app's redirect URI to match your deployment URL
3. Ensure all environment variables are configured
4. Test the application locally first

## Environment Variables

All platforms require these environment variables:

```
QB_CLIENT_ID=your_client_id
QB_CLIENT_SECRET=your_client_secret
QB_REDIRECT_URI=https://your-app-url.com/callback
QB_ENVIRONMENT=production
NODE_ENV=production
PORT=3000 (or platform-specific)
ALLOWED_ORIGINS=https://your-app-url.com
```

## AWS Elastic Beanstalk

### Deployment Steps

1. Install AWS CLI and EB CLI:
```bash
pip install awsebcli
```

2. Initialize Elastic Beanstalk:
```bash
eb init -p node.js quickbooks-online-management
```

3. Create environment:
```bash
eb create production
```

4. Set environment variables:
```bash
eb setenv QB_CLIENT_ID=your_id QB_CLIENT_SECRET=your_secret QB_REDIRECT_URI=your_uri QB_ENVIRONMENT=production NODE_ENV=production
```

5. Deploy:
```bash
eb deploy
```

### Configuration

Create `.ebextensions/01_nodecommand.config`:
```yaml
option_settings:
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "npm start"
```

## AWS Lambda + API Gateway

1. Use AWS SAM or Serverless Framework
2. Modify `index.js` to export handler function
3. Configure API Gateway for OAuth callback
4. Use AWS Secrets Manager for credentials

Example `serverless.yml`:
```yaml
service: quickbooks-management

provider:
  name: aws
  runtime: nodejs18.x
  environment:
    QB_CLIENT_ID: ${env:QB_CLIENT_ID}
    QB_CLIENT_SECRET: ${env:QB_CLIENT_SECRET}

functions:
  app:
    handler: lambda.handler
    events:
      - http: ANY /
      - http: ANY /{proxy+}
```

## Google Cloud Platform

### App Engine

1. Create `app.yaml`:
```yaml
runtime: nodejs18
env: standard
instance_class: F1

env_variables:
  NODE_ENV: 'production'
  QB_ENVIRONMENT: 'production'

automatic_scaling:
  min_instances: 1
  max_instances: 10
```

2. Deploy:
```bash
gcloud app deploy
```

3. Set secrets:
```bash
gcloud secrets create QB_CLIENT_ID --data-file=-
gcloud secrets create QB_CLIENT_SECRET --data-file=-
```

### Cloud Run

1. Create `Dockerfile`:
```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

2. Build and deploy:
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/quickbooks-management
gcloud run deploy quickbooks-management \
  --image gcr.io/PROJECT_ID/quickbooks-management \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

## Microsoft Azure

### App Service

1. Create App Service:
```bash
az webapp create \
  --resource-group myResourceGroup \
  --plan myAppServicePlan \
  --name quickbooks-management \
  --runtime "NODE|18-lts"
```

2. Configure app settings:
```bash
az webapp config appsettings set \
  --resource-group myResourceGroup \
  --name quickbooks-management \
  --settings QB_CLIENT_ID=your_id QB_CLIENT_SECRET=your_secret
```

3. Deploy:
```bash
az webapp deployment source config-zip \
  --resource-group myResourceGroup \
  --name quickbooks-management \
  --src ./app.zip
```

## Heroku

1. Create Heroku app:
```bash
heroku create quickbooks-management
```

2. Set environment variables:
```bash
heroku config:set QB_CLIENT_ID=your_id
heroku config:set QB_CLIENT_SECRET=your_secret
heroku config:set QB_REDIRECT_URI=https://your-app.herokuapp.com/callback
heroku config:set QB_ENVIRONMENT=production
heroku config:set NODE_ENV=production
```

3. Deploy:
```bash
git push heroku main
```

### Heroku Procfile

Create `Procfile`:
```
web: npm start
```

## DigitalOcean App Platform

1. Connect your GitHub repository
2. Configure app:
   - Type: Web Service
   - Build Command: `npm install`
   - Run Command: `npm start`
   - Port: 3000

3. Add environment variables in the dashboard

4. Deploy automatically on git push

## Docker

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - QB_CLIENT_ID=${QB_CLIENT_ID}
      - QB_CLIENT_SECRET=${QB_CLIENT_SECRET}
      - QB_REDIRECT_URI=${QB_REDIRECT_URI}
      - QB_ENVIRONMENT=production
      - NODE_ENV=production
    restart: unless-stopped
```

### Build and Run

```bash
docker build -t quickbooks-management .
docker run -p 3000:3000 --env-file .env quickbooks-management
```

## Kubernetes

Create deployment manifests:

### deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quickbooks-management
spec:
  replicas: 2
  selector:
    matchLabels:
      app: quickbooks-management
  template:
    metadata:
      labels:
        app: quickbooks-management
    spec:
      containers:
      - name: app
        image: your-registry/quickbooks-management:latest
        ports:
        - containerPort: 3000
        env:
        - name: QB_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: qb-secrets
              key: client-id
        - name: QB_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: qb-secrets
              key: client-secret
```

### service.yaml
```yaml
apiVersion: v1
kind: Service
metadata:
  name: quickbooks-management
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
  selector:
    app: quickbooks-management
```

## Post-Deployment Steps

After deploying to any platform:

1. **Update QuickBooks App Settings**
   - Log in to Intuit Developer Portal
   - Update the redirect URI to match your deployment URL
   - Save changes

2. **Test OAuth Flow**
   - Visit your app URL
   - Click "Connect to QuickBooks"
   - Complete authentication
   - Verify dashboard loads correctly

3. **Test API Endpoints**
   - Test `/health` endpoint
   - Test `/api/status` endpoint
   - Test company info retrieval

4. **Configure Monitoring**
   - Set up application monitoring (New Relic, Datadog, etc.)
   - Configure error tracking (Sentry, Rollbar, etc.)
   - Set up uptime monitoring

5. **Enable SSL/TLS**
   - Most platforms provide automatic SSL
   - Verify HTTPS is working
   - Test security headers

6. **Set Up Backups**
   - If using database for tokens (recommended for production)
   - Configure automated backups
   - Test restore procedures

## Troubleshooting

### Common Issues

1. **OAuth Redirect Fails**
   - Verify redirect URI matches exactly in QuickBooks app settings
   - Check that your deployment URL is accessible

2. **Environment Variables Not Loading**
   - Verify variables are set in platform settings
   - Check for typos in variable names
   - Restart the application after setting variables

3. **Port Binding Issues**
   - Use `process.env.PORT` which is set by most platforms
   - Some platforms use 8080 instead of 3000

4. **Token Refresh Fails**
   - Verify QuickBooks credentials are correct
   - Check that refresh token hasn't expired
   - Ensure proper error logging is enabled

## Performance Optimization

1. **Enable Compression**
   - Add compression middleware for production
   - Configure CDN for static assets

2. **Caching**
   - Implement Redis for session storage
   - Cache frequently accessed data

3. **Load Balancing**
   - Use platform's load balancing features
   - Configure health check endpoints

4. **Scaling**
   - Configure auto-scaling based on CPU/memory
   - Set appropriate min/max instances

## Security Checklist

- [ ] All environment variables are set securely
- [ ] HTTPS is enabled
- [ ] Security headers are configured
- [ ] CORS is properly configured
- [ ] Rate limiting is implemented
- [ ] Logging is configured
- [ ] Monitoring is set up
- [ ] Secrets are rotated regularly

## Support

For deployment issues:
- Check platform-specific documentation
- Review application logs
- Open an issue on GitHub with deployment details
