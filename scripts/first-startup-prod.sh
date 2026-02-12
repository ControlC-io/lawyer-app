#!/bin/sh
# First-time production startup: create SSL volume + dummy cert, start stack, optionally obtain Let's Encrypt cert.
# Run from project root: ./scripts/first-startup-prod.sh
# Optional: set CERTBOT_EMAIL=your@email.com to obtain a real certificate after startup.

set -e

DOMAIN="${DOMAIN:-automate.floowly.app}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Ensure we're in project root (directory that contains docker-compose.yml)
cd "$(dirname "$0")/.."
if ! [ -f docker-compose.yml ] || ! [ -f docker-compose.prod.yml ]; then
  echo "Error: run from project root (where docker-compose.yml and docker-compose.prod.yml are)."
  exit 1
fi

# Ensure .env exists
if ! [ -f .env ]; then
  if [ -f .env.sample ]; then
    echo "No .env found. Copying .env.sample to .env — please edit .env with real values and run this script again."
    cp .env.sample .env
    exit 1
  else
    echo "Error: no .env or .env.sample found."
    exit 1
  fi
fi

echo "=== Creating dummy SSL certificate so nginx can start ==="
$COMPOSE --profile init run --rm init-cert

echo ""
echo "=== Starting services (production) ==="
$COMPOSE up -d

echo ""
echo "Waiting for nginx to be up..."
sleep 3

if [ -n "$CERTBOT_EMAIL" ]; then
  echo ""
  echo "=== Obtaining Let's Encrypt certificate for $DOMAIN ==="
  if $COMPOSE run --rm certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive; then
    echo "Certificate obtained. Reloading nginx..."
    $COMPOSE exec nginx nginx -s reload
    echo "HTTPS is now using a real certificate."
  else
    echo "Certbot failed (e.g. DNS not pointing here or port 80 blocked). Site will use the dummy cert until you run certbot manually."
  fi
else
  echo ""
  echo "Tip: set CERTBOT_EMAIL=your@email.com and run this script again to get a real certificate, or run:"
  echo "  $COMPOSE run --rm certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --email your@email.com --agree-tos --no-eff-email"
  echo "  $COMPOSE exec nginx nginx -s reload"
fi

echo ""
echo "=== First startup complete ==="
echo "  App (HTTPS): https://$DOMAIN"
echo "  Ensure APP_URL in .env is set to https://$DOMAIN and restart backend if you change it."
echo ""
echo "Renew certificates (e.g. cron weekly):"
echo "  $COMPOSE run --rm certbot renew && $COMPOSE exec nginx nginx -s reload"
echo ""
