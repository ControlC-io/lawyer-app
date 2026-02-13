#!/bin/sh
# Create a dump of the local PostgreSQL database.
# Usage: ./scripts/dump-local-db.sh [dump-filename]
#   Dump is written to dumps/. If filename is omitted, uses: local-YYYY-MM-DD-HHMMSS.dump
#
# Output format: custom (.dump) - compatible with restore-from-dump.sh
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
PG_DB="${POSTGRES_DB:-floowly_db}"

# Get db container (works with docker compose v2)
CONTAINER=$(docker compose ps -q db 2>/dev/null || docker-compose ps -q db 2>/dev/null)
if [ -z "$CONTAINER" ]; then
  echo "Error: Database container is not running. Start it with: docker compose up -d db"
  exit 1
fi

# Use provided filename or generate timestamp-based default
if [ -n "$1" ]; then
  DUMP_NAME="$(basename "$1")"
  # Ensure it has a supported extension for restore script compatibility
  case "$DUMP_NAME" in
    *.sql|*.dump|*.backup|*.custom) ;;
    *) DUMP_NAME="${DUMP_NAME}.dump" ;;
  esac
else
  DUMP_NAME="local-$(date +%Y-%m-%d-%H%M%S).dump"
fi

# Ensure dumps directory exists
mkdir -p "$DUMPS_DIR"
DUMP_PATH="$DUMPS_DIR/$DUMP_NAME"

echo "Dumping database: $PG_DB"
echo "Output: dumps/$DUMP_NAME"
echo ""

# Use custom format (-Fc) for compact, restorable dumps
docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc -f - > "$DUMP_PATH"

echo "Dump completed successfully: dumps/$DUMP_NAME"
