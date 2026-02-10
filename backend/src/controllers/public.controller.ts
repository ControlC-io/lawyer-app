import { Request, Response } from 'express';
import { emailService } from '../services/email.service';

const FEEDBACK_EMAIL = process.env.FEEDBACK_EMAIL || 'contact@controlc.io';
const DEMO_REQUEST_EMAIL = process.env.DEMO_REQUEST_EMAIL || 'contact@controlc.io';

export const publicController = {
  /**
   * POST /api/public/feedback
   * Send feedback (was: send-feedback)
   */
  async sendFeedback(req: Request, res: Response) {
    try {
      const { userEmail, userName, feedback } = req.body;

      if (!userEmail || !feedback) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'userEmail and feedback are required',
        });
      }

      await emailService.sendFeedback(userEmail, `Feedback from ${userName || userEmail}`, feedback);

      return res.json({
        success: true,
        message: 'Feedback sent successfully',
      });
    } catch (error) {
      console.error('Error in send-feedback:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/public/demo-request
   * Request a demo (was: request-demo)
   */
  async requestDemo(req: Request, res: Response) {
    try {
      const { firstName, lastName, email, companyName } = req.body;

      if (!firstName || !lastName || !email || !companyName) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'firstName, lastName, email, and companyName are required',
        });
      }

      await emailService.sendDemoRequest(
        `${firstName} ${lastName}`,
        email,
        companyName
      );

      return res.json({
        success: true,
        message: 'Demo request sent successfully',
      });
    } catch (error) {
      console.error('Error in request-demo:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
