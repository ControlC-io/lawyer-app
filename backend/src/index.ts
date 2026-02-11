import { app } from './app';
import { storageService } from './services/storage.service';

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
});
