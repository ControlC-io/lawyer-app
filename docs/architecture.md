# Lexora — Architecture

## Project structure

```
lexora-app/
├── frontend/        React 18 + Vite + TypeScript + shadcn/ui + Tailwind
├── backend/         Express + Prisma + PostgreSQL
├── shared/          TypeScript types/utilities shared between frontend and backend
├── infrastructure/
│   ├── nginx/       spa.conf (frontend static), nginx.coolify.conf (reverse proxy), Dockerfile
│   └── minio/       Dockerfile (local dev only — builds MinIO from source)
├── scripts/         migrate.js, dev-local.ps1
└── docs/
```

npm workspaces monorepo. Import alias `@yourapp/shared` → `shared/src`.

---

## Data model (multi-tenancy)

Everything is scoped to a **Company**:

```
Company
  ├── Users (members, each with a role)
  ├── Persons (people under administration)
  ├── Document Types (Facture, Contrat, etc.)
  ├── Metadata Keys (Année, Mois, etc.)
  ├── Folders (person root folders + nested)
  └── Files (PDFs, docs — linked to folders and optionally a person)
```

Users belong to a company. All data queries are filtered by `company_id`. A user in company A cannot see data from company B.

---

## Backend (`backend/src`)

Express + Prisma + PostgreSQL. Layering: `routes/` → `controllers/` → `services/`, with cross-cutting access-control in `lib/`.

- `app.ts` builds the Express app (no `listen`); `index.ts` binds the port and starts background workers. Tests import `app.ts` directly via Supertest.
- `routes/index.ts` is the API mount map.
- All DB access goes through `lib/prisma.ts`.

### Authentication (`middleware/auth.ts`)

Three credential types checked in priority order:

1. `x-super-admin-api-key` → synthetic super-admin user (server-side bootstrap only)
2. `Authorization: Bearer <JWT>` → looked up in DB
3. `x-api-key` → company-scoped API key

### Authorization — two layers

- **RBAC** (`lib/rbac.ts`): page/domain-level permissions (`documents.view`, `persons.manage`, etc.). Admins always pass.
- **Document access rules** (`lib/documentAccess.ts`, `lib/folderAccess.ts`): fine-grained, metadata-condition-based access to individual files/folders.

---

## AI / document pipeline

- **OCR** (`services/ocr.service.ts`): provider-abstracted, currently Mistral. `processDocumentOcr` runs OCR then chains into metadata extraction if configured.
- **Metadata extraction** (`services/metadata-from-ocr-extraction.service.ts`): OCR text + metadata key IDs → Gemini → validated values written to `files_metadata_values`.
- **PDF split** (`services/pdf-split.service.ts`): Gemini suggests page-range segments + metadata from OCR text; `pdf-lib` performs the actual split. Gemini responses are markdown-fenced JSON — use `parseGeminiJson*` helpers, never raw `JSON.parse`.

### Split PDF flow

1. Browser extracts native text (pdfjs-dist). If ≥ 30 chars/page → skip OCR, send text directly to propose.
2. Scanned PDFs: upload → Mistral OCR → poll until `ocr_status === completed`.
3. `POST /split-pdf/propose` → Gemini returns segments with name, document_type, page ranges, metadata.
4. User reviews/edits in the UI (thumbnails rendered by pdfjs worker).
5. `POST /split-pdf/apply` → pdf-lib splits pages → files stored in MinIO → DB rows created.

---

## Frontend (`frontend/src`)

React 18 + Vite + TypeScript + shadcn/ui (Radix) + Tailwind. Routing: react-router-dom. Server state: @tanstack/react-query.

Pages: DocumentManagement, Persons, DocumentTypes, MetadataKeys, SplitPdfPage, UsersGroups, OrganizationSettings, ArchivedRecords.

PDF rendering uses `pdfjs-dist`. The worker file (`pdf.worker.min-*.mjs`) must be served with `Content-Type: application/javascript` — see `infrastructure/nginx/spa.conf` for the `.mjs` MIME type override.

---

## Storage (MinIO)

S3-compatible via the `minio` Node.js SDK, wrapped by `services/storage.service.ts`. The default bucket is created on startup if missing.

**Local dev**: image built from Go source (`infrastructure/minio/Dockerfile`) — community edition requires this.  
**Production (Coolify)**: official `minio/minio:latest` image — simpler, smaller, no build time.

---

## Database migrations

`backend/scripts/migrate.js` (cross-platform Node.js — replaces the old `migrate.sh`):
1. Parses `DATABASE_URL`, waits for Postgres
2. Runs `prisma generate`
3. Runs `prisma migrate deploy` (applies new migrations, never resets data)

Runs automatically on backend startup. To create a new migration locally: `npm run migrate:dev -w backend`.

---

## Docker services

| Service | Dev image | Prod image (Coolify) | Notes |
|---|---|---|---|
| `frontend` | Vite dev server (`:3000`) | nginx:alpine serving static build (`:80`) | |
| `backend` | ts-node + nodemon | compiled `node dist/index.js` | |
| `db` | postgres:15-alpine | postgres:15-alpine | |
| `minio` | Built from Go source | minio/minio:latest | |
| `nginx` | nginx:alpine (reverse proxy) | Built from `infrastructure/nginx/Dockerfile` | Config baked in — no volume mount |

Coolify/Traefik handles SSL termination upstream. All nginx configs are HTTP-only.
