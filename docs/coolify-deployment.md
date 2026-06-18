# Deploying to Coolify

Generic guide for projects using **Node.js backend + Vite/React frontend + PostgreSQL + MinIO + nginx**, deployed with Docker Compose on Coolify.

---

## Stack assumptions

- `backend/` — Node.js/Express API, TypeScript, Prisma
- `frontend/` — React + Vite SPA
- `db` — PostgreSQL
- `minio` — S3-compatible object storage
- `nginx` — reverse proxy routing `/api` to backend, `/` to frontend static files
- `docker-compose.yml` — local dev (source mounts, dev servers)
- `docker-compose.coolify.yml` — production (compiled binaries, no mounts)

---

## Step 1 — Create `docker-compose.coolify.yml`

Use this prompt with Claude Code to generate it:

> I need to prepare this project for deployment on Coolify using Docker Compose. Coolify has these specific behaviors that must be accounted for:
>
> 1. It runs `docker compose up` from its own persistent directory (not the build artifacts directory), so volume mounts of repo files will fail — any config files a service needs must be baked into the image via COPY in a Dockerfile, not mounted with `./path/file:/destination`.
> 2. Traefik (Coolify's reverse proxy) already owns ports 80 and 443 on the host — services must not expose those ports via `ports`.
> 3. The server has X GB RAM total, but another application is already running on it, so budget roughly 1.5–2 GB for this project's services.
> 4. Production services should run compiled binaries, not dev servers.
>
> Analyze the project and create a `docker-compose.coolify.yml` with:
> - Production images (compiled binaries, not `npm run dev`)
> - Any service config files (nginx, etc.) baked into dedicated Dockerfiles via COPY, not volume mounts
> - No `ports` bindings on services that sit behind nginx/Traefik
> - `expose: - "80"` on the nginx service so Coolify/Traefik knows which port to route to
> - Per-service memory limits that fit within a ~1.5–2 GB budget
> - Environment variables with safe defaults via `${VAR:-default}`
>
> Do not modify the existing `docker-compose.yml` — that is for local development and must stay as-is.

Replace **X GB** with your server's total RAM.

---

## Step 2 — Create `.env.production.sample`

Add a `.env.production.sample` to the repo (committed) and a `.env.prod` (gitignored) with real values.

`.gitignore` entry:
```
.env.prod
```

Key rules for production values:

| Variable | Rule |
|---|---|
| `APP_URL` | Full domain with protocol: `https://your-domain.com` |
| `BACKEND_URL` | Same as `APP_URL` |
| `VITE_API_URL` | **Leave empty** — frontend uses relative `/api` paths, nginx proxies them |
| `MINIO_PUBLIC_URL` | **Leave empty** if MinIO is not publicly exposed |
| `JWT_SECRET` | Random hex — `openssl rand -hex 32` |
| `SUPER_ADMIN_API_KEY` | Any strong secret — needed to bootstrap the DB |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Use internal Docker service name: `@db:5432` |
| `MINIO_ENDPOINT` | Internal Docker service name: `minio` |

> **`VITE_API_URL` must be empty.** Vite bakes env vars into the bundle at build time. Any non-empty value gets hardcoded into the JS and the frontend will call that URL directly — even `http://127.0.0.1:3001` — instead of using relative paths that nginx can proxy.

> **`NODE_ENV` at buildtime.** Coolify injects all env vars as Docker build ARGs. If `NODE_ENV=production` is available at buildtime, npm skips devDependencies and the TypeScript build fails. Either mark it as "Runtime only" in Coolify, or the Dockerfile should override it with `ENV NODE_ENV=development` in the build stage.

---

## Step 3 — Create the Coolify application

1. **New Resource → Docker Compose**
2. Connect the GitHub repo
3. Set **Docker Compose Location** to `/docker-compose.coolify.yml`
4. Set the **Domain** for the `nginx` service (e.g. `https://your-domain.com`)
5. Confirm the exposed port is `80`

---

## Step 4 — Set environment variables

In Coolify → **Environment Variables → Production**, paste the contents of `.env.prod` with real values.

Do not touch **Preview Deployments** variables unless you use Coolify preview deployments.

---

## Step 5 — Deploy

Click **Deploy**. Expected build time: ~4 min warm cache, ~8 min cold.

What happens internally:
1. Coolify clones the repo into a temporary artifacts directory
2. Docker BuildKit builds all images from that directory (repo files are available)
3. Coolify runs `docker compose up -d` from its **persistent app directory** (repo files are NOT available here — this is why volume mounts of repo files break)
4. On backend startup, `prisma migrate deploy` runs automatically and applies all pending migrations

---

## Step 6 — Bootstrap the database (first deploy only)

The database starts empty. You need to create the first company and admin user.

**From your local machine** (avoid the Coolify terminal — it wraps long lines and breaks commands):

```bash
# Step 1 — create the company
curl -s -X POST https://your-domain.com/api/companies \
  -H "x-super-admin-api-key: YOUR_SUPER_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Company Name"}'
```

Copy the `id` from the response, then:

```bash
# Step 2 — create the first admin user
curl -s -X POST https://your-domain.com/api/companies/COMPANY_ID/users \
  -H "x-super-admin-api-key: YOUR_SUPER_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword","role":"company_admin"}'
```

From Claude Code you can prefix with `!` to run directly in the terminal:
```
! curl -s -X POST https://your-domain.com/api/companies -H "x-super-admin-api-key: YOUR_KEY" -H "Content-Type: application/json" -d '{"name":"Your Company"}'
```

---

## Step 7 — Verify

Open `https://your-domain.com` and log in with the credentials you just created.

---

## DNS

If the domain shows a 404 or connects to the wrong server, update the DNS A record to point to the new server's IP. Changes can take a few minutes to propagate.

---

## Redeploying

| Change type | Action needed |
|---|---|
| Code change | Push to `main` → Coolify auto-deploys (if webhook configured) or click Redeploy |
| Backend env var | Redeploy — containers restart with new values |
| `VITE_*` env var | Redeploy — frontend bundle must be rebuilt with the new value baked in |
| New DB migration | Redeploy — `prisma migrate deploy` runs on backend startup |

---

## Common Coolify gotchas

| Problem | Cause | Fix |
|---|---|---|
| Build hangs for 1+ hour | npm cache mount (`--mount=type=cache`) shared between parallel service builds — npm file lock causes one to block the other | Add a unique `id=` per service: `--mount=type=cache,id=npm-backend,target=/root/.npm` |
| nginx fails: "not a directory" | Volume mount of a repo file — Coolify's persistent dir doesn't have repo files, Docker creates an empty directory instead | Bake the config into the image: create a small Dockerfile that `COPY`s the file, use `build:` instead of `image:` |
| Port 80 already allocated | Coolify's Traefik owns port 80 on the host | Remove `ports` from nginx; add `expose: - "80"` |
| 404 after successful deploy | Traefik has no route to the container | Set the domain on the nginx service in Coolify; confirm `expose: - "80"` is in the compose file |
| Frontend calls `http://127.0.0.1:3001` | `VITE_API_URL` had a non-empty value at build time | Set `VITE_API_URL=` (empty) in Coolify env vars and redeploy |
| Login fails after redeploy | DB volume was recreated (data wiped) or `JWT_SECRET` changed | Re-run Step 6 to recreate company and user |
| TypeScript build fails: missing devDependencies | `NODE_ENV=production` injected at buildtime by Coolify | Mark `NODE_ENV` as "Runtime only" in Coolify, or set `ENV NODE_ENV=development` in the builder stage of the Dockerfile |
