import path from 'path';
import { config } from 'dotenv';

// Load .env from project root when running from backend/ (e.g. npm run dev in backend)
const rootEnv = path.resolve(__dirname, '../../.env');
config({ path: rootEnv });
if (!process.env.DATABASE_URL) {
  config(); // fallback to cwd .env
}

import { app } from './app';
import { prisma } from './lib/prisma';
import { storageService } from './services/storage.service';
import { archivePurgeService } from './services/archivePurge.service';

const port = process.env.PORT || 3001;

async function waitForDb(maxAttempts = 20, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await prisma.$connect();
      console.log('Database connected');
      return;
    } catch {
      if (i === maxAttempts) throw new Error(`Database not reachable after ${maxAttempts} attempts`);
      console.log(`Database not ready, retrying... (${i}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

waitForDb()
  .then(() => {
    app.listen(port, async () => {
      console.log(`Backend server running at http://localhost:${port}`);

      try {
        await storageService.init();
        console.log('Storage service initialized successfully');
      } catch (error) {
        console.error('Failed to initialize storage service:', error);
      }

      archivePurgeService.startWorker();
    });
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
