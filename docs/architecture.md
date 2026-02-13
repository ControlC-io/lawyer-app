# Floowly Monorepo Documentation

## Project Structure

- `frontend/`: React + Vite application.
- `backend/`: Express.js server + Prisma ORM.
- `shared/`: Shared TypeScript types and utilities.
- `infrastructure/`: Docker, Nginx, and MinIO configurations.
- `scripts/`: Helper scripts for development.
- `docs/`: Project documentation.

## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development environment:
   ```bash
   npm run dev
   ```

### Running with Docker

To start the entire stack using Docker Compose:

```bash
docker-compose up --build
```

The application will be available at:
- Frontend/Proxy: http://localhost
- Backend API: http://localhost/api
- MinIO Console: http://localhost:9001
- Direct Frontend: http://localhost:3000
- Direct Backend: http://localhost:3001
- Direct MinIO API: http://localhost:9000

## Database & Migrations

Floowly uses **Prisma** as its ORM and migration management tool.

### Migration Flow

The migration process is fully automated within the Docker lifecycle:

1. **Startup**: When the `backend` container starts, it executes `backend/scripts/migrate.sh`.
2. **Health Check**: The script waits for the PostgreSQL database (`db` service) to be ready using a Node.js-based port check.
3. **Prisma Generation**: The Prisma Client is generated inside the container to ensure the application has access to the latest database types.
4. **Migration Deployment**: 
   - On a fresh install, Prisma runs the `0_init` migration to baseline the schema.
   - On updates, Prisma detects new migration files in `backend/prisma/migrations/` and applies them automatically using `prisma migrate deploy`.

### Key Benefits
- **No Source Access Required**: Users running the container don't need to manually run SQL scripts or have Prisma installed locally.
- **Data Safety**: `migrate deploy` is designed for production use; it only applies new changes and does not reset or delete existing data.
- **Consistency**: Centralizing migrations in Prisma ensures the database schema always matches the application code version.

## File Storage (MinIO)

Floowly uses **MinIO** for S3-compatible object storage to manage file uploads and assets.

## Get file dump through SCP

```bash
scp root@[SERVER_IP]:path/to/dump/floowly_dump.sql ./dumps/
```

### Integration Details

1. **Source Build**: Due to MinIO's source-only distribution for the community edition, the image is built from source using a multi-stage Dockerfile located at `infrastructure/minio/Dockerfile`.
2. **Persistence**: Data is persisted using a Docker named volume `minio_data`, mapped to `/data` inside the container.
3. **Backend Service**: The backend connects to MinIO using the official `minio` Node.js SDK.
4. **Initialization**: On backend startup, the `StorageService` checks for the existence of the default bucket (defined by `MINIO_BUCKET_NAME`) and creates it if it doesn't exist.

### Accessing MinIO

- **API Endpoint**: `http://localhost:9000` (Internal service name: `minio`)
- **Web Console**: `http://localhost:9001`
- **Default Credentials**: `minioadmin` / `minioadmin`
