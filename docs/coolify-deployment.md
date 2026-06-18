# Deploying to Coolify

This guide covers everything needed to deploy this app on a new Coolify server.

---

## 1. Prerequisites

- A Coolify instance running on a VPS (tested with 4 GB RAM)
- The domain DNS pointing to the server's IP address
- The GitHub repo connected to Coolify

---

## 2. Create the Coolify application

In Coolify:
1. **New Resource → Docker Compose**
2. Connect the GitHub repo
3. Set **Docker Compose Location** to `/docker-compose.coolify.yml`
4. Set the **Domain** for the `nginx` service to your domain (e.g. `https://lexora.controlc.io`)
5. Make sure the **exposed port** for nginx is `80`

---

## 3. Set environment variables

Go to **Environment Variables → Production** and paste the contents of `.env.production.sample` with real values filled in.

Key things that must be correct:

| Variable | Value |
|---|---|
| `APP_URL` | `https://your-domain.com` |
| `BACKEND_URL` | `https://your-domain.com` |
| `VITE_API_URL` | *(leave empty)* |
| `MINIO_PUBLIC_URL` | *(leave empty)* |
| `JWT_SECRET` | Random 32-byte hex — generate with `openssl rand -hex 32` |
| `SUPER_ADMIN_API_KEY` | Any strong secret — you'll need this to bootstrap |
| `NODE_ENV` | `production` |

> **Important:** `VITE_API_URL` must be empty. If it contains any URL, it gets baked into the frontend bundle at build time and the app will call that URL directly instead of using relative `/api` paths that nginx proxies.

> **Important:** Do not set `NODE_ENV` as available at buildtime in Coolify — or set it to `development` for build only. Setting it to `production` at buildtime causes npm to skip devDependencies and the TypeScript build fails.

---

## 4. Deploy

Click **Deploy**. Expected build time: ~4 minutes on a warm cache, ~8 minutes cold.

What happens during deploy:
1. Coolify clones the repo into a build artifacts directory
2. Docker BuildKit builds `backend`, `frontend`, and `nginx` images
3. Coolify runs `docker compose up -d` from its persistent app directory
4. On backend startup, `prisma migrate deploy` runs automatically and creates all tables

---

## 5. Bootstrap the database (first deploy only)

The database starts empty. You need to create the first company and admin user manually.

Open **Terminal** in Coolify → select the `backend` container → **Connect**.

**Step 1 — create the company:**
```bash
wget -qO- --header="x-super-admin-api-key: YOUR_SUPER_ADMIN_API_KEY" --header="Content-Type: application/json" --post-data='{"name":"Lexora"}' http://localhost:3001/api/companies
```

Copy the `id` from the response.

**Step 2 — create the admin user:**

The Coolify terminal wraps long lines and breaks commands. Run from your local machine instead:

```bash
curl -s -X POST https://your-domain.com/api/companies/COMPANY_ID/users \
  -H "x-super-admin-api-key: YOUR_SUPER_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"yourpassword","role":"company_admin"}'
```

Or from Claude Code terminal with `!` prefix:
```
! curl -s -X POST https://your-domain.com/api/companies/COMPANY_ID/users -H "x-super-admin-api-key: YOUR_SUPER_ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"yourpassword","role":"company_admin"}'
```

---

## 6. Verify

Open `https://your-domain.com` and log in with the credentials you just created.

---

## Redeploying after env var changes

Any change to `VITE_API_URL` or other `VITE_*` variables requires a full redeploy — they are baked into the frontend bundle at build time, not read at runtime.

All other backend env vars take effect after a redeploy (containers restart with the new values).

---

## Common Coolify gotchas

| Problem | Cause | Fix |
|---|---|---|
| Build hangs for 1+ hour | npm cache mount shared between parallel builds | Each service needs a unique `id=` on `--mount=type=cache` |
| nginx fails to start: "not a directory" | Volume mount of a repo file — Coolify runs `docker compose up` from its persistent dir, not the build artifacts dir | Bake config files into the image with `COPY` in a Dockerfile instead of mounting them |
| Port 80 already allocated | Coolify's Traefik owns port 80 | Remove `ports` from nginx; use `expose: - "80"` so Traefik knows the internal port |
| 404 after successful deploy | Traefik doesn't know which container/port to route to | Set the domain on the correct service in Coolify and make sure `expose` is set |
| Login returns "Invalid credentials" after redeploy | Database was wiped (new volume) or JWT_SECRET changed | Re-run the bootstrap steps to recreate company and user |
| Frontend calls `http://127.0.0.1:3001` | `VITE_API_URL` was set to that value at build time | Set `VITE_API_URL=` (empty) and redeploy |

---

## Creating the `docker-compose.coolify.yml` for a new project

Use this prompt with Claude Code:

> I need to prepare this project for deployment on Coolify using Docker Compose. Coolify has these specific behaviors that must be accounted for:
>
> 1. It runs `docker compose up` from its own persistent directory (not the build artifacts directory), so volume mounts of repo files will fail — any config files a service needs must be baked into the image via COPY in a Dockerfile, not mounted with `./path/file:/destination`.
> 2. Traefik (Coolify's reverse proxy) already owns ports 80 and 443 on the host — services must not expose those ports via `ports`.
> 3. The server has 4 GB RAM total, but another application is already running on it, so budget roughly 1.5–2 GB for this project's services.
> 4. Production services should run compiled binaries, not dev servers.
>
> Analyze the project and create a `docker-compose.coolify.yml` with:
> - Production images (compiled binaries, not `npm run dev`)
> - Any service config files (nginx, etc.) baked into dedicated Dockerfiles via COPY, not volume mounts
> - No `ports` bindings on services that sit behind nginx/Traefik
> - Per-service memory limits that fit within a ~1.5–2 GB budget
> - Environment variables with safe defaults via `${VAR:-default}`
>
> Do not modify the existing `docker-compose.yml` — that is for local development and must stay as-is.
