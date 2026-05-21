import path from 'path';
import { config } from 'dotenv';

// Load .env from project root when running from backend/ (e.g. npm run dev in backend)
const rootEnv = path.resolve(__dirname, '../../.env');
config({ path: rootEnv });
if (!process.env.DATABASE_URL) {
  config(); // fallback to cwd .env
}

import { app } from './app';
import { storageService } from './services/storage.service';
import { stepReminderService } from './services/stepReminder.service';
import { archivePurgeService } from './services/archivePurge.service';
import { externalLinkExpiryService } from './services/externalLinkExpiry.service';

const port = process.env.PORT || 3001;

app.listen(port, async () => {
  console.log(`Backend server running at http://localhost:${port}`);
  
  // Initialize storage
  try {
    await storageService.init();
    console.log('Storage service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize storage service:', error);
  }

  // Start background reminder worker for open workflow steps.
  stepReminderService.startWorker();
  archivePurgeService.startWorker();
  externalLinkExpiryService.startWorker();
});
