import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/** Synthetic user id when authenticated via SUPER_ADMIN_API_KEY (server-side only). */
export const SUPER_ADMIN_API_USER_ID = 'super-admin-api';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    /** True when authenticated via SUPER_ADMIN_API_KEY; grants super_admin access. */
    super_admin?: boolean;
  };
  company?: {
    id: string;
    name: string;
  };
  isInternal?: boolean;
}

/**
 * General authentication middleware - supports JWT, company API keys, and super admin API key
 */
export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  const superAdminKey = req.headers['x-super-admin-api-key'];
  const superAdminApiKey = process.env.SUPER_ADMIN_API_KEY || '';

  // 1. Check for Super Admin API Key (server-side only; grants super_admin access)
  if (superAdminApiKey && superAdminKey && typeof superAdminKey === 'string') {
    if (superAdminKey === superAdminApiKey) {
      req.user = {
        id: SUPER_ADMIN_API_USER_ID,
        email: 'superadmin@api',
        super_admin: true,
      };
      return next();
    }
  }

  // 2. Check for API Key (Company authorization)
  if (apiKey && typeof apiKey === 'string') {
    try {
      const company = await prisma.company.findUnique({
        where: { api_key: apiKey },
      });

      if (company && company.is_active) {
        req.company = {
          id: company.id,
          name: company.name,
        };
        return next();
      }
    } catch (error) {
      console.error('API Key validation error:', error);
    }
  }

  // 3. Check for JWT (User authorization)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { profile: true }
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
        };
        return next();
      }
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Missing or invalid authentication' });
};

/**
 * Internal API authentication - for database triggers and internal services
 */
export const internalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const internalKey = req.headers['x-internal-api-key'];

  if (!INTERNAL_API_KEY) {
    console.error('INTERNAL_API_KEY not configured');
    return res.status(500).json({ error: 'Internal API key not configured' });
  }

  if (internalKey === INTERNAL_API_KEY) {
    req.isInternal = true;
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid internal API key' });
};

/**
 * API Key only authentication - for company API endpoints
 */
export const apiKeyAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({
      error: 'Missing API key',
      details: 'x-api-key header is required',
    });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { api_key: apiKey },
    });

    if (!company) {
      return res.status(401).json({
        error: 'Invalid API key',
        details: 'The provided api_key does not match any company in the system',
      });
    }

    if (!company.is_active) {
      return res.status(403).json({
        error: 'Company inactive',
        details: 'This company account is not active',
      });
    }

    req.company = {
      id: company.id,
      name: company.name,
    };

    next();
  } catch (error) {
    console.error('API Key validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * External step token authentication - for public form submissions
 */
export const externalStepAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.params.token;

  if (!token) {
    return res.status(401).json({
      error: 'Missing token',
      details: 'Token is required in the URL',
    });
  }

  try {
    // Find execution step with this external token
    const executionStep = await prisma.workflowExecutionStep.findFirst({
      where: { external_token: token },
      include: {
        execution: {
          select: {
            id: true,
            company_id: true,
          },
        },
        step: {
          select: {
            id: true,
            step_type: true,
          },
        },
      },
    });

    if (!executionStep) {
      return res.status(404).json({
        error: 'Invalid or expired token',
        details: 'The provided token does not match any active step',
      });
    }

    // Add execution step info to request
    (req as any).executionStep = executionStep;

    next();
  } catch (error) {
    console.error('External token validation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Optional authentication - doesn't fail if no auth provided
 */
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // Try API Key
  if (apiKey && typeof apiKey === 'string') {
    try {
      const company = await prisma.company.findUnique({
        where: { api_key: apiKey },
      });

      if (company && company.is_active) {
        req.company = {
          id: company.id,
          name: company.name,
        };
        return next();
      }
    } catch (error) {
      console.error('API Key validation error:', error);
    }
  }

  // Try JWT
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { profile: true }
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
        };
        return next();
      }
    } catch (error) {
      // Continue without auth
    }
  }

  // Continue without authentication
  next();
};
