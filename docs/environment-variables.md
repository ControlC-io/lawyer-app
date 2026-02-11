# Environment Variables

This document explains how the `.env` file works in this project and how to set environment variables in production with Docker.

## Purpose of .env

The `.env` file holds local and environment-specific configuration (including secrets). **Never commit real secrets to the repository.** The `.env` file is listed in `.gitignore` and must stay out of version control.

## .env vs .env.sample

| File | Committed? | Purpose |
|------|------------|---------|
| **.env.sample** | Yes | Template listing all variables with safe placeholders. Copy it to create your local config. |
| **.env** | No (gitignored) | Your actual config and secrets. Create it from the sample and edit with real values. |

**Setup:** Copy the sample to `.env` and fill in values:

```bash
cp .env.sample .env
# Edit .env with your real values (API keys, secrets, etc.)
```

## How .env is used

### With Docker Compose (development)

Docker Compose automatically loads a **`.env`** file from the **project root** when you run `docker compose up`. It uses this file **only for variable substitution** in `docker-compose.yml`: any `${VAR}` or `${VAR:-default}` in the compose file is replaced with the value from `.env` (or the default). The backend and frontend containers receive environment variables from the `environment` block in `docker-compose.yml`; those values are either hardcoded there or substituted from your root `.env`. So placing variables in a root `.env` lets you drive what gets passed into the containers without editing `docker-compose.yml`.

### Running the backend locally (no Docker)

The backend does not load a `.env` file by default. To use one when running the backend outside Docker (e.g. `npm run dev -w backend`), either:

- **Export variables from .env before starting:**  
  `export $(grep -v '^#' .env | xargs)` then start the backend, or
- **Use your IDE/process runner** to load env from a file, or
- **Add a loader** (e.g. `dotenv`) in the backend so it loads `.env` from the project root when the process starts (optional improvement).

## Setting environment variables in production with Docker

In production, do not rely on a committed `.env` file. Set variables using one of these approaches.

### Option A: env file on the server

Create an env file on the server (e.g. from a secret manager or by hand, and keep it out of the repo). Then:

- **docker run:**  
  `docker run --env-file .env.production ... your-image`
- **Docker Compose:** In your production compose file, add `env_file: .env.production` to the backend (and frontend if needed). Never commit `.env.production`.

### Option B: Explicit environment block

Pass variables explicitly so they come from your deployment system (CI, vault, etc.):

- **docker run:**  
  `docker run -e JWT_SECRET=... -e DATABASE_URL=... ... your-image`
- **Docker Compose:** In the service’s `environment` block, list each variable (values can be `${VAR}` from the host env or from a compose env file).

### Option C: Docker secrets / orchestration

With Docker Swarm or Kubernetes, use secrets and config maps and inject them as environment variables or files into the container. Refer to your platform’s docs for the exact syntax.

## Frontend (Vite)

Variables prefixed with **`VITE_`** (e.g. `VITE_API_URL`) are embedded at **build time**. For production Docker, pass `VITE_API_URL` (or equivalent) when building the frontend image (e.g. via build args or env when running `npm run build`) so the built assets use the correct API URL.

## Full variable list and deployment steps

For the complete list of environment variables and deployment instructions, see [deployment.md](deployment.md).
