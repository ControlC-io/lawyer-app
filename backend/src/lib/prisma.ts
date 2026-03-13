import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// After a company is created, auto-generate an API key (if missing) and seed system roles.
prisma.$use(async (params, next) => {
  const result = await next(params);

  if (params.model === 'Company' && params.action === 'create') {
    const companyId: string = result.id;

    // Generate API key if not provided
    if (!result.api_key) {
      const apiKey = crypto.randomBytes(32).toString('hex');
      await prisma.company.update({
        where: { id: companyId },
        data: { api_key: apiKey },
      });
      result.api_key = apiKey;
    }

    // Seed Admin and Member system roles (import inline to avoid circular dependency)
    const { seedSystemRolesForCompany } = await import('./rbac');
    await seedSystemRolesForCompany(companyId);
  }

  return result;
});

export default prisma;
export { prisma };
