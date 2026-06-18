# Deployment Guide

Lexora is deployed via **Coolify** using `docker-compose.coolify.yml`. For the complete step-by-step Coolify deployment guide see [coolify-deployment.md](coolify-deployment.md).

---

## Local development

### Full Docker stack

```bash
cp .env.sample .env   # fill in real values
docker compose up -d
docker compose exec backend npm run migrate:deploy
```

Services: frontend `:3000`, backend `:3001`, MinIO API `:9000`, MinIO console `:9001`.

### Host dev (recommended on Windows — faster HMR)

Start only DB + MinIO in Docker, run app code on the host:

```bash
docker compose up -d db minio
.\scripts\dev-local.ps1
```

Frontend proxies `/api` → `http://127.0.0.1:3001` via Vite. Set `VITE_API_URL=http://127.0.0.1:3001` in `.env`.

---

## Production (Coolify)

See [coolify-deployment.md](coolify-deployment.md) for full instructions including:
- Creating the Coolify application
- Environment variables (use `.env.production.sample` as reference)
- First-deploy database bootstrap
- Common gotchas

---

## Database

Migrations run automatically on backend startup via `backend/scripts/migrate.js` (cross-platform Node.js — replaces the old `migrate.sh`). It waits for Postgres, runs `prisma generate`, then `prisma migrate deploy`.

To author a new migration locally:
```bash
npm run migrate:dev -w backend
```

### Backup / restore

```bash
# Backup
docker compose exec db pg_dump -U postgres lawyer_app_db > backup.sql

# Restore
docker compose exec -T db psql -U postgres lawyer_app_db < backup.sql

# Copy dump from server
scp root@SERVER_IP:/path/to/backup.sql ./dumps/
```

---

## Health checks

```bash
curl http://localhost:3001/health          # backend
docker compose exec db pg_isready         # postgres
curl http://localhost:9000/minio/health/live  # minio
```

---

## Security checklist (production)

- [ ] `JWT_SECRET` — random 32-byte hex (`openssl rand -hex 32`)
- [ ] `INTERNAL_API_KEY` — random hex
- [ ] `SUPER_ADMIN_API_KEY` — strong secret, stored securely
- [ ] `POSTGRES_PASSWORD` — not the default `postgres`
- [ ] `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — not `minioadmin`
- [ ] `NODE_ENV=production`
- [ ] `ENABLE_PUBLIC_SIGNUP=false` unless intentionally open
- [ ] `APP_URL` / `BACKEND_URL` point to the real HTTPS domain
- [ ] `VITE_API_URL` is empty (relative API calls via nginx)
