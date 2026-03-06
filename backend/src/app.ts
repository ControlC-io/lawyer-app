import express, { Request, Response } from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/validation';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 files
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      database: 'connected',
      storage: 'connected',
      ocr: {
        enabled: !!process.env.OCR_API_KEY,
        provider: process.env.OCR_PROVIDER || 'mistral',
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      storage: 'disconnected',
      ocr: {
        enabled: !!process.env.OCR_API_KEY,
        provider: process.env.OCR_PROVIDER || 'mistral',
      },
      message: (error as Error).message
    });
  }
});

// API Routes
app.use('/api', routes);

// Error handlers (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export { app, prisma };
