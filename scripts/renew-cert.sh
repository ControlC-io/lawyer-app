#!/bin/sh
# Renew Let's Encrypt certificate and reload nginx. For use in cron (e.g. weekly).
# Install: crontab -e, then add (adjust path to your repo):
#   0 0 * * 0 /path/to/Floowly/scripts/renew-cert.sh >> /var/log/floowly-cert-renew.log 2>&1

set -e

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

cd "$(dirname "$0")/.."
if ! [ -f docker-compose.yml ] || ! [ -f docker-compose.prod.yml ]; then
  echo "Error: run from project root (where docker-compose.yml and docker-compose.prod.yml are)."
  exit 1
fi

$COMPOSE run --rm certbot renew
$COMPOSE exec -T nginx nginx -s reload
echo "$(date -Iseconds) cert renewal finished"
