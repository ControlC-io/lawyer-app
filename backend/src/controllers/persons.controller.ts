import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest, ALL_COMPANIES } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const PERSONNE_KEY_NAME = 'Personne';

/**
 * Keeps the "Personne" FilesMetadataKey allowed_values in sync with the
 * current list of persons for a company. Creates the key if missing.
 * Pass a Prisma transaction client (tx) when calling from inside $transaction.
 */
async function syncPersonsMetadataKey(
  companyId: string,
  tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'> = prisma,
): Promise<void> {
  const persons = await tx.person.findMany({
    where: { company_id: companyId },
    orderBy: { full_name: 'asc' },
    select: { full_name: true },
  });
  const allowedValues: Prisma.InputJsonValue = persons.map((p) => p.full_name);

  const existing = await tx.filesMetadataKey.findFirst({
    where: { company_id: companyId, name: PERSONNE_KEY_NAME },
  });

  if (existing) {
    await tx.filesMetadataKey.update({
      where: { id: existing.id },
      data: { allowed_values: allowedValues },
    });
  } else {
    await tx.filesMetadataKey.create({
      data: {
        company_id: companyId,
        name: PERSONNE_KEY_NAME,
        value_kind: 'predefined_list',
        allowed_values: allowedValues,
      },
    });
  }
}

async function ensureCompanyAccess(req: AuthRequest, companyId: string) {
  if (req.company && !req.user) {
    if (req.company.id !== companyId) {
      return { error: { status: 403, body: { error: 'Forbidden', details: 'API key is not valid for this company' } } };
    }
    return {};
  }

  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, body: { error: 'Unauthorized', details: 'Authentication required' } } };
  }

  if (req.user?.super_admin) {
    return {};
  }

  if (companyId === ALL_COMPANIES) {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'companyId=all is reserved for super admin' } } };
  }

  const userCompany = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
  });

  if (!userCompany) {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'You do not have access to this company' } } };
  }

  return { userCompany };
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const personsController = {
  async list(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const persons = await prisma.person.findMany({
        where: { company_id: companyId },
        orderBy: { full_name: 'asc' },
        include: {
          root_folder: { select: { id: true, name: true } },
        },
      });
      return res.json(persons);
    } catch (error) {
      console.error('listPersons error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async get(req: AuthRequest, res: Response) {
    try {
      const { companyId, personId } = req.params;
      if (!companyId || !personId) return res.status(400).json({ error: 'Missing company ID or person ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const person = await prisma.person.findFirst({
        where: { id: personId, company_id: companyId },
        include: {
          root_folder: { select: { id: true, name: true } },
        },
      });
      if (!person) return res.status(404).json({ error: 'Person not found' });
      return res.json(person);
    } catch (error) {
      console.error('getPerson error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { full_name, national_id, notes } = req.body ?? {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const name = typeof full_name === 'string' ? full_name.trim() : '';
      if (!name) return res.status(400).json({ error: 'full_name is required' });

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const person = await prisma.$transaction(async (tx) => {
        const folder = await tx.folder.create({
          data: {
            company_id: companyId,
            name,
            description: 'Person root folder',
          },
        });
        const created = await tx.person.create({
          data: {
            company_id: companyId,
            full_name: name,
            national_id: trimOrNull(national_id),
            notes: trimOrNull(notes),
            root_folder_id: folder.id,
          },
          include: {
            root_folder: { select: { id: true, name: true } },
          },
        });
        await syncPersonsMetadataKey(companyId, tx);
        return created;
      });

      return res.status(201).json(person);
    } catch (error) {
      console.error('createPerson error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const { companyId, personId } = req.params;
      const { full_name, national_id, notes } = req.body ?? {};
      if (!companyId || !personId) return res.status(400).json({ error: 'Missing company ID or person ID' });

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const existing = await prisma.person.findFirst({
        where: { id: personId, company_id: companyId },
      });
      if (!existing) return res.status(404).json({ error: 'Person not found' });

      const nextName = typeof full_name === 'string' ? full_name.trim() : existing.full_name;
      if (!nextName) return res.status(400).json({ error: 'full_name cannot be empty' });

      const person = await prisma.$transaction(async (tx) => {
        if (existing.root_folder_id && nextName !== existing.full_name) {
          await tx.folder.updateMany({
            where: { id: existing.root_folder_id, company_id: companyId },
            data: { name: nextName },
          });
        }
        const updated = await tx.person.update({
          where: { id: personId },
          data: {
            full_name: nextName,
            ...(national_id !== undefined ? { national_id: trimOrNull(national_id) } : {}),
            ...(notes !== undefined ? { notes: trimOrNull(notes) } : {}),
          },
          include: {
            root_folder: { select: { id: true, name: true } },
          },
        });
        if (nextName !== existing.full_name) {
          await syncPersonsMetadataKey(companyId, tx);
        }
        return updated;
      });

      return res.json(person);
    } catch (error) {
      console.error('updatePerson error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async remove(req: AuthRequest, res: Response) {
    try {
      const { companyId, personId } = req.params;
      if (!companyId || !personId) return res.status(400).json({ error: 'Missing company ID or person ID' });

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const existing = await prisma.person.findFirst({
        where: { id: personId, company_id: companyId },
      });
      if (!existing) return res.status(404).json({ error: 'Person not found' });

      if (existing.root_folder_id) {
        const [fileCount, subFolderCount] = await Promise.all([
          prisma.file.count({ where: { folder_id: existing.root_folder_id, is_archived: false } }),
          prisma.folder.count({ where: { parent_folder_id: existing.root_folder_id } }),
        ]);
        if (fileCount > 0 || subFolderCount > 0) {
          return res.status(409).json({
            error: 'Person folder is not empty',
            details: 'Remove or move documents before deleting this person',
          });
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.person.delete({ where: { id: personId } });
        if (existing.root_folder_id) {
          await tx.folder.deleteMany({ where: { id: existing.root_folder_id, company_id: companyId } });
        }
        await syncPersonsMetadataKey(companyId, tx);
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deletePerson error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
