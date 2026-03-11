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
    /** True when user has super_admin in profile_admin_roles (JWT) or when authenticated via SUPER_ADMIN_API_KEY. */
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

  // 2. Check for JWT (User authorization) first when present.
  // This prevents user-scoped endpoints from being widened by x-api-key.
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          profile: {
            include: { admin_role: { select: { super_admin: true } } },
          },
        },
      });

      if (user) {
        const super_admin = user.profile?.admin_role?.super_admin ?? false;
        req.user = {
          id: user.id,
          email: user.email,
          super_admin,
        };
        return next();
      }
    } catch (error) {
      // If an API key is also present, allow fallback to API key auth.
      if (!apiKey) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }
  }

  // 3. Check for x-api-key: super_admin first, then company
  if (apiKey && typeof apiKey === 'string') {
    if (superAdminApiKey && apiKey === superAdminApiKey) {
      req.user = {
        id: SUPER_ADMIN_API_USER_ID,
        email: 'superadmin@api',
        super_admin: true,
      };
      return next();
    }
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
 * API Key only authentication - for company API endpoints (also accepts super_admin key via x-api-key or x-super-admin-api-key)
 */
export const apiKeyAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const superAdminKey = req.headers['x-super-admin-api-key'];
  const superAdminApiKey = process.env.SUPER_ADMIN_API_KEY || '';

  // Super admin key via x-super-admin-api-key or x-api-key: set user only, no company
  if (superAdminApiKey && superAdminKey && typeof superAdminKey === 'string' && superAdminKey === superAdminApiKey) {
    req.user = {
      id: SUPER_ADMIN_API_USER_ID,
      email: 'superadmin@api',
      super_admin: true,
    };
    return next();
  }
  if (superAdminApiKey && apiKey && typeof apiKey === 'string' && apiKey === superAdminApiKey) {
    req.user = {
      id: SUPER_ADMIN_API_USER_ID,
      email: 'superadmin@api',
      super_admin: true,
    };
    return next();
  }

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({
      error: 'Missing API key',
      details: 'x-api-key or x-super-admin-api-key header is required',
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
  const superAdminKey = req.headers['x-super-admin-api-key'];
  const superAdminApiKey = process.env.SUPER_ADMIN_API_KEY || '';

  // Try x-super-admin-api-key or x-api-key: super_admin first, then company
  if (superAdminApiKey && superAdminKey && typeof superAdminKey === 'string' && superAdminKey === superAdminApiKey) {
    req.user = {
      id: SUPER_ADMIN_API_USER_ID,
      email: 'superadmin@api',
      super_admin: true,
    };
    return next();
  }
  if (apiKey && typeof apiKey === 'string') {
    if (superAdminApiKey && apiKey === superAdminApiKey) {
      req.user = {
        id: SUPER_ADMIN_API_USER_ID,
        email: 'superadmin@api',
        super_admin: true,
      };
      return next();
    }
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
        include: {
          profile: {
            include: { admin_role: { select: { super_admin: true } } },
          },
        },
      });

      if (user) {
        const super_admin = user.profile?.admin_role?.super_admin ?? false;
        req.user = {
          id: user.id,
          email: user.email,
          super_admin,
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

/**
 * Resolve req.company for apiKeyAuth-only routes when caller is super_admin.
 * If req.company is already set, returns true. If req.user?.super_admin and company_id
 * is provided (X-Company-Id header or body.company_id), loads company and sets req.company.
 * Otherwise sends 401 and returns false.
 */
export async function resolveCompanyForRequest(
  req: AuthRequest,
  res: Response
): Promise<boolean> {
  if (req.company) {
    return true;
  }
  if (req.user?.super_admin) {
    let companyId =
      (req.headers['x-company-id'] as string) ||
      (req.body?.company_id as string) ||
      (req.query?.company_id as string);

    // Auto-resolve company from execution if no company explicitly provided
    if (!companyId && req.params?.executionId) {
      try {
        const execution = await prisma.workflowExecution.findUnique({
          where: { id: req.params.executionId },
          select: { company_id: true },
        });
        if (execution?.company_id) {
          companyId = execution.company_id;
        }
      } catch (error) {
        console.error('resolveCompanyForRequest: error looking up execution company:', error);
      }
    }

    // Auto-resolve company from workflow if no company explicitly provided
    if (!companyId && req.params?.workflowId) {
      try {
        const workflow = await prisma.workflow.findUnique({
          where: { id: req.params.workflowId },
          select: { company_id: true },
        });
        if (workflow?.company_id) {
          companyId = workflow.company_id;
        }
      } catch (error) {
        console.error('resolveCompanyForRequest: error looking up workflow company:', error);
      }
    }

    if (companyId && typeof companyId === 'string') {
      try {
        const company = await prisma.company.findFirst({
          where: { id: companyId, is_active: true },
        });
        if (company) {
          req.company = { id: company.id, name: company.name };
          return true;
        }
      } catch (error) {
        console.error('resolveCompanyForRequest error:', error);
      }
    }
  }
  res.status(401).json({
    error: 'Company context required',
    details:
      'Provide x-api-key (company key) or X-Company-Id header / company_id in body when using super admin key',
  });
  return false;
}

/**
 * Super-admin-only authentication middleware.
 * Accepts SUPER_ADMIN_API_KEY via x-super-admin-api-key or x-api-key.
 * Rejects all other callers with 403.
 */
export const superAdminAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const superAdminApiKey = process.env.SUPER_ADMIN_API_KEY || '';
  if (!superAdminApiKey) {
    return res.status(500).json({ error: 'SUPER_ADMIN_API_KEY not configured' });
  }

  const key =
    (req.headers['x-super-admin-api-key'] as string) ||
    (req.headers['x-api-key'] as string);

  if (key === superAdminApiKey) {
    req.user = {
      id: SUPER_ADMIN_API_USER_ID,
      email: 'superadmin@api',
      super_admin: true,
    };
    return next();
  }

  return res.status(403).json({ error: 'Forbidden', details: 'Super admin API key required' });
};

/** Sentinel value for `:companyId` meaning "all companies" (super admin only). */
export const ALL_COMPANIES = 'all';

/**
 * Returns a Prisma-compatible filter fragment.
 * When companyId is ALL_COMPANIES the fragment is empty so no company scoping is applied.
 */
export function companyFilter(companyId: string): { company_id?: string } {
  return companyId === ALL_COMPANIES ? {} : { company_id: companyId };
}
