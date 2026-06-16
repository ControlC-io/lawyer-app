import { Request, Response } from 'express';

export const publicController = {
  /**
   * GET /api/public/config
   * Public config (no auth required). Used by Auth page to show/hide signup.
   */
  async getConfig(_req: Request, res: Response) {
    return res.json({ signupEnabled: process.env.ENABLE_PUBLIC_SIGNUP === 'true' });
  },
};
