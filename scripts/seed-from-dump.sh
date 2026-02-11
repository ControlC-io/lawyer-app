#!/bin/sh
# Seed PostgreSQL from extracted auth+public data (database/seed-data.sql).
# Run after: node scripts/extract-seed-data.js
# Requires: DATABASE_URL in environment (or from .env when run from repo root).

set -e

# Ensure we are in the repo root
SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Load .env if present (e.g. DATABASE_URL)
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . .env
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set. Set it in .env or export it."
  exit 1
fi

echo "Waiting for database to be ready..."
until psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; do
  echo "Database is not ready yet. Retrying in 2 seconds..."
  sleep 2
done
echo "Database is ready."

echo "Generating Prisma Client..."
npx prisma generate --schema=backend/prisma/schema.prisma

echo "Running migrations..."
if ! npx prisma migrate deploy --schema=backend/prisma/schema.prisma; then
  echo "Migration failed. Checking if we need to baseline..."
  npx prisma migrate resolve --applied 0_init --schema=backend/prisma/schema.prisma 2>/dev/null || true
  npx prisma migrate deploy --schema=backend/prisma/schema.prisma
fi

if [ ! -f database/seed-data.sql ]; then
  echo "Error: database/seed-data.sql not found. Run: node scripts/extract-seed-data.js"
  exit 1
fi

echo "Cleaning seeded tables only..."
psql "$DATABASE_URL" -f database/truncate-seed-tables.sql

echo "Loading seed data..."
psql "$DATABASE_URL" -f database/seed-data.sql

echo "Seed completed."
