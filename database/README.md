# Database scripts (outside Prisma)

This folder holds SQL used for initial setup, migrations, and seeds that are not managed by Prisma.

## Seeding from Supabase dump

Only these tables are seeded (all in `public`):

- `companies`, `api_configurations`
- All agent tables: `agent_categories`, `agent_configurations`, `agent_permissions`
- Workflow metadata: `workflows`, `workflow_steps`, `workflow_statuses`, `workflow_permissions`, `workflow_connections`, `workflow_categories`

To repopulate PostgreSQL with data from a previous Supabase dump (`temp/database-dump.sql`):

1. **Extract seed data** (run once, or whenever the dump changes):
   ```bash
   node scripts/extract-seed-data.js
   ```
   Optional: pass a custom dump path:
   ```bash
   node scripts/extract-seed-data.js /path/to/database-dump.sql
   ```
   This writes `database/seed-data.sql` (COPY blocks for the tables above only). This file is gitignored.

2. **Run the seed** (requires PostgreSQL up and `DATABASE_URL` set):
   ```bash
   npm run db:seed
   ```
   Or from the project root:
   ```bash
   sh scripts/seed-from-dump.sh
   ```

   The script will:
   - Wait for the database
   - Run Prisma migrations
   - Truncate only the seeded tables (see `truncate-seed-tables.sql`)
   - Load `seed-data.sql` via `psql`

**When running in Docker:** use the backend service so `DATABASE_URL` is set (e.g. `docker compose run --rm backend sh scripts/seed-from-dump.sh` from repo root, or ensure the script is invoked with `DATABASE_URL=postgresql://postgres:postgres@db:5432/floowly_db`).

**When running on the host:** set `DATABASE_URL` in `.env` or export it (e.g. `postgresql://postgres:postgres@localhost:5432/floowly_db`). The `psql` CLI must be installed (e.g. `brew install libpq` or install PostgreSQL client).
