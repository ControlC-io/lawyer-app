#!/bin/sh

# Wait for the database to be ready
echo "Waiting for database to be ready..."
# Use node to check if the database port is open
until node -e "const net = require('net'); const client = net.createConnection({ host: 'db', port: 5432 }, () => { process.exit(0); }); client.on('error', () => { process.exit(1); }); setTimeout(() => { process.exit(1); }, 1000);"
do
  echo "Database is not ready yet. Retrying in 2 seconds..."
  sleep 2
done

# Give the database a moment to fully initialize after the port opens
sleep 2

# Ensure we are in the ROOT directory
cd "$(dirname "$0")/../.."

echo "Generating Prisma Client..."
npx prisma generate --schema=backend/prisma/schema.prisma

echo "Running migrations..."
npx prisma migrate deploy --schema=backend/prisma/schema.prisma

# If the migration fails, it might be because the database already has the tables
# but doesn't have the _prisma_migrations table (the "baseline" scenario).
if [ $? -ne 0 ]; then
  echo "Migration failed. Checking if we need to baseline..."
  # Try to resolve 0_init as applied if it's the first time
  npx prisma migrate resolve --applied 0_init --schema=backend/prisma/schema.prisma
  # Try deploy again for any subsequent migrations
  npx prisma migrate deploy --schema=backend/prisma/schema.prisma
fi

echo "Migrations completed."
