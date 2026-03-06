import { Router } from 'express';
import { ocrController } from '../controllers/ocr.controller';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

router.post('/:fileId/ocr', authMiddleware, asyncHandler(ocrController.triggerOcr));
router.get('/:fileId/ocr', authMiddleware, asyncHandler(ocrController.getOcr));

export default router;
