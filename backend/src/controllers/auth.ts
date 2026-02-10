import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const register = async (req: Request, res: Response) => {
  const { email, password, full_name } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        encrypted_password: hashedPassword,
        profile: {
          create: {
            email,
            full_name,
          },
        },
      },
      include: {
        profile: true,
      },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.profile?.full_name,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
      },
    });

    if (!user || !user.encrypted_password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.encrypted_password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.profile?.full_name,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
};

/**
 * GET /api/me
 * Get current user profile, companies, and super_admin flag (JWT required)
 */
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        details: 'Authentication required',
      });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        notifications_enabled: true,
        created_at: true,
        updated_at: true,
        user_companies: {
          select: { company_id: true, role: true },
        },
        admin_role: {
          select: { super_admin: true },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
        details: 'User profile not found',
      });
    }

    const super_admin = profile.admin_role?.super_admin ?? false;
    const user_companies = profile.user_companies.map((uc: { company_id: string; role: string }) => ({
      company_id: uc.company_id,
      role: uc.role,
    }));

    return res.json({
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        notifications_enabled: profile.notifications_enabled,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      user_companies,
      super_admin,
    });
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * PATCH /api/me
 * Update current user profile (full_name, notifications_enabled) - JWT required
 */
export const updateMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        details: 'Authentication required',
      });
    }

    const { full_name, notifications_enabled } = req.body || {};
    const updateData: { full_name?: string; notifications_enabled?: boolean } = {};
    if (typeof full_name === 'string') updateData.full_name = full_name.trim() || null;
    if (typeof notifications_enabled === 'boolean') updateData.notifications_enabled = notifications_enabled;

    const profile = await prisma.profile.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        full_name: true,
        notifications_enabled: true,
        created_at: true,
        updated_at: true,
      },
    });

    return res.json(profile);
  } catch (error) {
    console.error('updateMe error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * POST /api/auth/change-password
 * Change password for current user (JWT required)
 */
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { current_password, new_password } = req.body || {};
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        details: 'Authentication required',
      });
    }
    if (!current_password || !new_password || typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({
        error: 'Invalid input',
        details: 'current_password and new_password (min 6 characters) are required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { encrypted_password: true },
    });
    if (!user?.encrypted_password) {
      return res.status(401).json({ error: 'Invalid credentials', details: 'User not found or no password set' });
    }

    const bcrypt = await import('bcryptjs');
    const valid = await bcrypt.compare(current_password, user.encrypted_password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials', details: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { encrypted_password: hashed },
    });

    return res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error('changePassword error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
