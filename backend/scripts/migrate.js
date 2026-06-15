#!/usr/bin/env node
/**
 * Cross-platform migration runner (Windows + Linux + Docker).
 * Replaces migrate.sh for local and container use.
 */
const { spawnSync } = require('child_process');
const net = require('net');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const schemaPath = path.join(backendDir, 'prisma', 'schema.prisma');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd ?? repoRoot,
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseDatabaseHostPort() {
  const url = process.env.DATABASE_URL ?? '';
  try {
    const parsed = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    return {
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port) || 5432,
      url,
    };
  } catch {
    return { host: 'localhost', port: 5432, url };
  }
}

function canConnect(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const client = net.createConnection({ host, port }, () => {
      client.end();
      resolve(true);
    });
    client.setTimeout(timeoutMs);
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
    client.on('error', () => resolve(false));
  });
}

function rewriteDatabaseHost(url, nextHost) {
  if (!url) return url;
  try {
    const parsed = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    parsed.hostname = nextHost;
    return `postgresql://${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return url.replace(/@db:/, `@${nextHost}:`).replace(/@db\//, `@${nextHost}/`);
  }
}

/** Returns true when running inside a Docker container. */
function isInsideDocker() {
  const fs = require('fs');
  return fs.existsSync('/.dockerenv');
}

async function resolveDatabaseTarget(maxAttempts = 30) {
  let { host, port, url } = parseDatabaseHostPort();
  const inDocker = isInsideDocker();

  // When running on a Windows/macOS host and the DB host is the Docker service
  // name "db" (unreachable from outside the Docker network), fall back to
  // localhost once — but never inside a container where "db" IS reachable.
  if (host === 'db' && !inDocker) {
    if (await canConnect('localhost', port)) {
      const localUrl = rewriteDatabaseHost(url, 'localhost');
      process.env.DATABASE_URL = localUrl;
      console.log('Host "db" not reachable outside Docker — using localhost instead.');
      return { host: 'localhost', port };
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await canConnect(host, port)) {
      return { host, port };
    }

    if (attempt >= maxAttempts) {
      throw new Error(
        `Database not reachable at ${host}:${port} after ${maxAttempts} attempts. ` +
          'Start Postgres with: docker compose up -d db',
      );
    }

    console.log(`Database not ready (${host}:${port}). Retrying in 2s... (${attempt}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { host, port };
}

async function main() {
  try {
    require('dotenv').config({ path: path.join(repoRoot, '.env') });
  } catch {
    // dotenv optional if env already set
  }

  const { host, port } = await resolveDatabaseTarget();
  console.log(`Database ready at ${host}:${port}`);

  console.log('Generating Prisma Client...');
  run('npx', ['prisma', 'generate', `--schema=${schemaPath}`]);

  console.log('Running migrations...');
  const deploy = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', `--schema=${schemaPath}`],
    { stdio: 'inherit', cwd: repoRoot, shell: process.platform === 'win32', env: process.env },
  );

  if (deploy.status !== 0) {
    console.log('Migration failed. Attempting baseline resolve for 0_init...');
    spawnSync(
      'npx',
      ['prisma', 'migrate', 'resolve', '--applied', '0_init', `--schema=${schemaPath}`],
      { stdio: 'inherit', cwd: repoRoot, shell: process.platform === 'win32', env: process.env },
    );
    run('npx', ['prisma', 'migrate', 'deploy', `--schema=${schemaPath}`]);
  }

  console.log('Migrations completed.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
