# Deployment Guide

## Docker Deployment

### Prerequisites

- Docker and Docker Compose installed
- MinIO access credentials
- SendGrid API key (optional, for emails)
- OpenAI API key (optional, for transcription)
- Lovable API key (optional, for AI workflow creation)

### Environment Configuration

1. Create a `.env` file in the project root (or update `docker-compose.yml`):

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@db:5432/floowly_db

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=floowly
MINIO_PUBLIC_URL=http://localhost:9000
MINIO_EXTERNAL_ENDPOINT=
MINIO_SIGNED_URL_MAX_AGE=604800

# Backend Authentication
JWT_SECRET=your-jwt-secret-key-change-in-production
INTERNAL_API_KEY=internal-trigger-key-change-in-production
# Set to "true" to allow public signup (account creation without invitation); default off
# ENABLE_PUBLIC_SIGNUP=false

# Email (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@floowly.app

# Application
APP_URL=http://localhost
NODE_ENV=production
PORT=3001

# AI Services (Optional)
OPENAI_API_KEY=your-openai-key
LOVABLE_API_KEY=your-lovable-key
FLOOWLY_AI_VALIDATION_API_KEY=your-ai-validation-key
AI_FORM_VALIDATION_URL=https://automation.floowly.app/webhook/7604f736-0ea8-4ec1-9b03-082256e42e0c

# Demo/Feedback (Optional)
DEMO_REQUEST_EMAIL=contact@controlc.io
FEEDBACK_EMAIL=contact@controlc.io
```

### Build and Run

```bash
# Build all services
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Reset everything (including data)
docker-compose down -v
```

### Initial Setup

After first deployment:

1. **Run database migrations**:
```bash
docker-compose exec backend npm run migrate:deploy
```

2. **Verify services are healthy**:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "storage": "connected"
}
```

3. **Verify MinIO is accessible**:
- Console: http://localhost:9001
- API: http://localhost:9000

### Production with HTTPS (Droplet / DigitalOcean)

For production with HTTPS (Let's Encrypt) on a single domain (e.g. `automate.floowly.app`):

1. **First-time startup** (creates dummy cert, starts stack, optionally obtains real cert):

   ```bash
   # From project root. Ensure .env exists (copy from .env.sample and edit).
   ./scripts/first-startup-prod.sh
   ```

   To obtain a real certificate in the same run, set your email:

   ```bash
   CERTBOT_EMAIL=your@email.com ./scripts/first-startup-prod.sh
   ```

2. **What the script does**: Runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml` with the `init` profile to create a dummy SSL cert so nginx can start, then brings up all services. If `CERTBOT_EMAIL` is set, it runs Certbot to get a Let's Encrypt certificate and reloads nginx.

3. **Manual certificate (if you didn't use CERTBOT_EMAIL)**:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly --webroot -w /var/www/certbot -d automate.floowly.app --email your@email.com --agree-tos --no-eff-email
   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
   ```

4. **Renewal (e.g. cron weekly)**:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot renew && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
   ```

5. **Files used**: `docker-compose.prod.yml` (production overrides, SSL volumes, certbot), `infrastructure/nginx/nginx.prod.conf` (HTTP→HTTPS redirect, ACME challenge, HTTPS proxy). Domain is set to `automate.floowly.app` in both; for another domain, edit those files and set `DOMAIN=your.domain` when running the script.

### Production Deployment

#### Security Checklist

- [ ] Change all default passwords and secrets
- [ ] Use strong JWT_SECRET and INTERNAL_API_KEY
- [ ] Configure HTTPS/TLS for all services
- [ ] Use environment-specific `.env` files
- [ ] Restrict database access to backend only
- [ ] Enable MinIO SSL (`MINIO_USE_SSL=true`)
- [ ] Configure proper CORS origins
- [ ] Review and update Nginx configuration

#### Recommended Production Setup

```yaml
# docker-compose.prod.yml
services:
  backend:
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}  # From secure vault
      - INTERNAL_API_KEY=${INTERNAL_API_KEY}  # From secure vault
      - DATABASE_URL=${DATABASE_URL}  # Managed database
      - SENDGRID_API_KEY=${SENDGRID_API_KEY}
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M
```

#### Database Backup

```bash
# Backup
docker-compose exec db pg_dump -U postgres floowly_db > backup.sql

# Restore
docker-compose exec -T db psql -U postgres floowly_db < backup.sql
```

#### MinIO Data Migration

If migrating files from Supabase Storage:

1. Export files from Supabase Storage
2. Upload to MinIO using `mc` (MinIO Client):

```bash
# Install mc
brew install minio/stable/mc

# Configure
mc alias set myminio http://localhost:9000 minioadmin minioadmin

# Upload files
mc cp --recursive ./exported-files/ myminio/documents/
```

## Service URLs

### Development
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Database: localhost:5432
- MinIO Console: http://localhost:9001
- MinIO API: http://localhost:9000
- Nginx: http://localhost:80

### Production
Configure these in your production environment:
- Frontend: https://app.yourdomain.com
- Backend API: https://api.yourdomain.com
- MinIO: https://storage.yourdomain.com (internal)

## Monitoring

### Health Checks

```bash
# Backend
curl http://localhost:3001/health

# Database
docker-compose exec db pg_isready

# MinIO
curl http://localhost:9000/minio/health/live
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f db
docker-compose logs -f minio
```

## Scaling

### Horizontal Scaling

To scale the backend:

```bash
docker-compose up -d --scale backend=3
```

Ensure:
- Load balancer (Nginx) distributes requests
- Database can handle connection pool from multiple backends
- Session state is stateless (JWT-based)

### Database Performance

For production:
- Use managed PostgreSQL (AWS RDS, Google Cloud SQL, etc.)
- Configure connection pooling
- Enable query logging for slow queries
- Regular VACUUM and ANALYZE

### Storage Performance

For production:
- Use managed S3-compatible storage
- Configure CDN for file delivery
- Implement caching for signed URLs

## Troubleshooting

### Backend won't start
- Check DATABASE_URL is correct
- Verify MinIO is running
- Check logs: `docker-compose logs backend`

### Triggers not working
- Verify pg_net extension is installed
- Check trigger_settings table configuration
- Ensure INTERNAL_API_KEY matches between DB and backend
- See [trigger-setup.md](./trigger-setup.md)

### File uploads failing
- Verify MinIO is running and accessible
- Check bucket exists: `documents`
- Verify MinIO credentials in environment

### Emails not sending
- Check SENDGRID_API_KEY is set
- Verify FROM_EMAIL is authorized in SendGrid
- Check backend logs for email errors
