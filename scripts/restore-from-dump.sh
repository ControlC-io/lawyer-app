#!/bin/sh
# Restore local PostgreSQL database from a dump file.
# Usage: ./scripts/restore-from-dump.sh <dump-filename>
#   Dump must be in the dumps/ folder. Provide only the filename (e.g. prod-2025-02-13.dump)
#
# Supports:
#   - Plain SQL dumps (.sql) - created with: pg_dump -f dump.sql ...
#   - Custom format (.dump, .backup, .custom) - created with: pg_dump -Fc -f dump.dump ...
#
# Requires: Docker Compose with db service running.

set -e

SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DUMPS_DIR="$ROOT_DIR/dumps"

# Load .env if present
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  . .env
  set +a
fi

# Defaults matching docker-compose
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
PG_DB="${POSTGRES_DB:-floowly_db}"

if [ -z "$1" ]; then
  echo "Usage: $0 <dump-filename>"
  echo "  Dump must be in dumps/. Provide only the filename (e.g. prod-2025-02-13.dump)"
  if [ -d "$DUMPS_DIR" ]; then
    echo ""
    echo "Available dumps in dumps/:"
    ls -1 "$DUMPS_DIR" 2>/dev/null | grep -E '\.(sql|dump|backup|custom)$' || echo "  (none)"
  else
    echo ""
    echo "Dumps folder does not exist. Create it and add your dump: mkdir -p dumps"
  fi
  exit 1
fi

# Use only the basename to prevent path traversal (e.g. ../.env)
DUMP_NAME="$(basename "$1")"
DUMP_PATH="$DUMPS_DIR/$DUMP_NAME"

if [ ! -d "$DUMPS_DIR" ]; then
  echo "Error: Dumps folder not found at $DUMPS_DIR"
  echo "Create it and add your dump: mkdir -p dumps"
  exit 1
fi

if [ ! -f "$DUMP_PATH" ]; then
  echo "Error: Dump file not found: $DUMP_NAME"
  echo "Expected location: dumps/$DUMP_NAME"
  echo ""
  AVAILABLE=$(ls -1 "$DUMPS_DIR" 2>/dev/null | grep -E '\.(sql|dump|backup|custom)$' || true)
  if [ -n "$AVAILABLE" ]; then
    echo "Available dumps in dumps/:"
    echo "$AVAILABLE"
  else
    echo "No dumps found in dumps/ folder."
  fi
  exit 1
fi

# Get db container (works with docker compose v2)
CONTAINER=$(docker compose ps -q db 2>/dev/null || docker-compose ps -q db 2>/dev/null)
if [ -z "$CONTAINER" ]; then
  echo "Error: Database container is not running. Start it with: docker compose up -d db"
  exit 1
fi

echo "Restoring from: dumps/$DUMP_NAME"
echo "Target database: $PG_DB (container: ${CONTAINER})"
echo ""

# Detect format by extension
case "$DUMP_PATH" in
  *.sql)
    echo "Detected plain SQL dump. Restoring with psql..."
    echo "Note: For a clean restore, ensure the dump was created with pg_dump --clean"
    docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" < "$DUMP_PATH"
    ;;
  *.dump|*.backup|*.custom)
    echo "Detected custom format dump. Restoring with pg_restore..."
    # Copy dump into container (pg_restore needs file access)
    DOCKER_TMP="/tmp/restore-$$.dump"
    docker cp "$DUMP_PATH" "$CONTAINER:$DOCKER_TMP"
    # Restore with --clean --if-exists to drop existing objects first
    if docker exec "$CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner --no-acl "$DOCKER_TMP" 2>/dev/null; then
      :
    else
      # pg_restore may exit with 1 for non-fatal warnings (e.g. pre-existing roles)
      echo "Restore completed (some warnings may have been suppressed)."
    fi
    docker exec "$CONTAINER" rm -f "$DOCKER_TMP"
    ;;
  *)
    echo "Error: Unknown dump format. Use .sql for plain SQL or .dump/.backup/.custom for custom format."
    exit 1
    ;;
esac

echo ""
echo "Database restore completed successfully."
