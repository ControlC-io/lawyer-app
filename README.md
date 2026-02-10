# Floowly - Self-Hosted Workflow Management Platform

A complete workflow management platform with Express.js backend, React frontend, and Docker containerization.

## Features

- Visual workflow builder with drag-and-drop interface
- Automatic step processing with database triggers
- File management with MinIO S3-compatible storage
- User authentication and role-based access control
- Email notifications via SendGrid
- AI-powered workflow creation and form validation
- RESTful API for workflow execution
- Multi-tenant support with company isolation

## Tech Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Storage**: MinIO (S3-compatible)
- **Email**: SendGrid
- **Authentication**: JWT + API Keys

### Frontend
- **Framework**: React with Vite
- **Language**: TypeScript

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Reverse Proxy**: Nginx
- **Database Triggers**: PostgreSQL pg_net extension

## Quick Start

### Development

1. **Clone the repository**
```bash
git clone <repository-url>
cd Floowly
```

2. **Start all services**
```bash
docker-compose up -d
```

3. **Access the application**
- Frontend: http://localhost:3000
- Backend health: http://localhost:3001/health
- Backend API (base path `/api`): http://localhost:3001/api
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

### First-Time Setup

1. **Run database migrations**
```bash
docker-compose exec backend npm run migrate:deploy
```

2. **Verify health**
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"status":"ok","database":"connected","storage":"connected"}
```

## Project Structure

```
Floowly/
├── backend/          # Express.js API server
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── routes/        # API routes (workflow definitions at /api/companies/:companyId/workflows)
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Auth, validation, errors, logging
│   │   ├── lib/           # Shared utilities (e.g. Prisma client)
│   │   ├── app.ts         # Express app, /health, /api mount
│   │   └── index.ts       # Server entry point
│   ├── prisma/
│   │   ├── schema.prisma  # Database schema
│   │   └── migrations/    # Database migrations
│   └── Dockerfile
├── frontend/         # React application
│   ├── src/
│   └── Dockerfile
├── shared/           # Shared TypeScript types
├── infrastructure/   # Nginx, MinIO configs
├── scripts/          # Helper scripts (e.g. setup.sh)
├── docs/             # Documentation
│   ├── architecture.md
│   ├── deployment.md
│   ├── openapi.yaml
│   ├── testing-strategy.md
│   └── trigger-setup.md
└── docker-compose.yml
```

## API Documentation

### Authentication

```bash
# User authentication (JWT)
Authorization: Bearer <jwt-token>

# Company API authentication
x-api-key: <company-api-key>

# Internal (triggers)
x-internal-api-key: <internal-api-key>
```

## Database Triggers

PostgreSQL triggers automatically process workflow steps. See [trigger-setup.md](./docs/trigger-setup.md) for details.

## Configuration

### Environment Variables

See `docker-compose.yml` for all available environment variables.

Key variables:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT token signing
- `INTERNAL_API_KEY`: Key for database trigger authentication
- `SENDGRID_API_KEY`: SendGrid API key for emails
- `MINIO_*`: MinIO storage configuration

### Production Configuration

1. Update all secrets and keys
2. Configure HTTPS/TLS
3. Set `NODE_ENV=production`
4. Update `APP_URL` to production domain
5. Configure database backups
6. Set up monitoring and alerts

## Development

### Running Locally

```bash
# Install dependencies
npm install

# Start development servers
docker-compose up

# Migrations run automatically when starting the backend (dev script runs migrate:deploy first).
# For a new migration: npm run migrate:dev -w backend

# Generate Prisma client / build
npm run build -w backend
```

### Adding New Endpoints

1. Create controller in `backend/src/controllers/`
2. Create route in `backend/src/routes/`
3. Register route in `backend/src/routes/index.ts`
4. Update [docs/openapi.yaml](docs/openapi.yaml)

### Database Changes

```bash
# Create new migration
npx prisma migrate dev --name your_migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset
```

## Migration from Supabase

This project was migrated from Supabase. Edge functions were converted to Express.js endpoints. See project history and [architecture.md](./docs/architecture.md) for context.

## Testing

```bash
# Run tests
npm test

# Run specific test
npm test -- workflow.test.ts
```

## See also

- [Architecture](docs/architecture.md) — Project structure and getting started
- [Testing strategy](docs/testing-strategy.md) — How to run and write tests
- [OpenAPI spec](docs/openapi.yaml) — API reference

## Deployment

See [deployment.md](./docs/deployment.md) for detailed deployment instructions.

## License

[Your License Here]

## Support

For issues or questions, please contact: [your-contact]
