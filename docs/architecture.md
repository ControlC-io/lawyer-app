# Lexora Monorepo Documentation

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

Lexora uses **Prisma** as its ORM and migration management tool.

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

## PDF Split Flow

The split PDF feature processes a user-uploaded PDF into separate logical documents using OCR and AI.

### Pipeline

1. **Native text detection** — Before uploading, the browser uses `pdfjs-dist` to attempt text extraction from the PDF. If the average character count per page is ≥ 30 (native/digital PDF), the extracted text is sent directly to the propose endpoint and OCR is skipped entirely (~30–60 sec total). Scanned PDFs (< 30 chars/page) proceed to step 2.

2. **Upload + OCR** — The PDF is uploaded to the backend. For scanned PDFs, OCR is queued (Mistral API via `services/ocr.service.ts`). The frontend polls `GET /api/files/:id/ocr` until `ocr_status === 'completed'`.

3. **Propose** — `POST /api/companies/:id/documents/split-pdf/propose` accepts `{ fileId, nativeText? }`. If `nativeText` is provided it is used directly; otherwise `file.ocr_markdown` from the DB is used. The OCR markdown (capped at 900 000 chars) is sent to Gemini along with all configured Document Types. Gemini returns a JSON array of segments with `name`, `document_type_id`, `start_page`, `end_page`, and `metadata`.

4. **Review** — The user sees page thumbnails and per-segment fields (name, document type, person, metadata). All fields are pre-filled by Gemini and editable.

5. **Apply** — `POST /api/companies/:id/documents/split-pdf/apply` validates segments, uses `pdf-lib` to extract page ranges, stores each output PDF in MinIO, creates `file` DB rows, and writes metadata values. If `person_id` is set per segment, the file is placed in that person's root folder.

## File Storage (MinIO)

Lexora uses **MinIO** for S3-compatible object storage to manage file uploads and assets.

## Get file dump through SCP

```bash
scp root@[SERVER_IP]:path/to/dump/dossier_app_dump.sql ./dumps/
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
