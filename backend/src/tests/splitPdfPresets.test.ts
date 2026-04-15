import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    documentSplitPreset: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    filesMetadataKey: { findMany: jest.fn() },
  },
}));

describe('Split PDF Presets endpoints', () => {
  const companyId = 'company-123';
  const userId = 'user-123';
  const prismaMock = prisma as any;
  let permissionKeys: string[] = [];
  let token = '';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    permissionKeys = [];
    token = jwt.sign({ userId }, process.env.JWT_SECRET);

    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      profile: { admin_role: { super_admin: false } },
    });

    (prismaMock.userCompany.findFirst as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        user_id: userId,
        company_id: companyId,
        role: 'user',
        custom_role: {
          permissions: permissionKeys.map((permission_key) => ({ permission_key })),
        },
      }),
    );
  });

  it('lists presets for users with documents.view', async () => {
    permissionKeys = ['documents.view'];
    (prismaMock.documentSplitPreset.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'preset-1',
        name: 'Invoices',
        naming_instructions: 'Use invoice number in filename',
        metadata_key_ids: ['meta-a', 'meta-b'],
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const response = await request(app)
      .get(`/api/companies/${companyId}/documents/split-pdf-presets`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.presets).toHaveLength(1);
    expect(response.body.presets[0]).toMatchObject({
      id: 'preset-1',
      name: 'Invoices',
      namingInstructions: 'Use invoice number in filename',
      metadataKeyIds: ['meta-a', 'meta-b'],
    });
  });

  it('rejects preset creation without documents.manage', async () => {
    permissionKeys = ['documents.view'];

    const response = await request(app)
      .post(`/api/companies/${companyId}/documents/split-pdf-presets`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invoices',
        namingInstructions: 'Use invoice number in filename',
        metadataKeyIds: ['meta-a'],
      });

    expect(response.status).toBe(403);
    expect(prismaMock.documentSplitPreset.create).not.toHaveBeenCalled();
  });

  it('creates preset with documents.manage', async () => {
    permissionKeys = ['documents.manage'];
    (prismaMock.filesMetadataKey.findMany as jest.Mock).mockResolvedValue([{ id: 'meta-a' }]);
    (prismaMock.documentSplitPreset.create as jest.Mock).mockResolvedValue({
      id: 'preset-2',
      name: 'Invoices',
      naming_instructions: 'Use invoice number in filename',
      metadata_key_ids: ['meta-a'],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request(app)
      .post(`/api/companies/${companyId}/documents/split-pdf-presets`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invoices',
        namingInstructions: 'Use invoice number in filename',
        metadataKeyIds: ['meta-a'],
      });

    expect(response.status).toBe(201);
    expect(prismaMock.filesMetadataKey.findMany).toHaveBeenCalledWith({
      where: { company_id: companyId, id: { in: ['meta-a'] } },
      select: { id: true },
    });
    expect(response.body).toMatchObject({
      id: 'preset-2',
      name: 'Invoices',
      namingInstructions: 'Use invoice number in filename',
      metadataKeyIds: ['meta-a'],
    });
  });

  it('rejects update when metadata keys do not belong to company', async () => {
    permissionKeys = ['documents.manage'];
    (prismaMock.documentSplitPreset.findFirst as jest.Mock).mockResolvedValue({ id: 'preset-2' });
    (prismaMock.filesMetadataKey.findMany as jest.Mock).mockResolvedValue([{ id: 'meta-a' }]);

    const response = await request(app)
      .patch(`/api/companies/${companyId}/documents/split-pdf-presets/preset-2`)
      .set('Authorization', `Bearer ${token}`)
      .send({ metadataKeyIds: ['meta-a', 'meta-b'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('invalid for this company');
    expect(prismaMock.documentSplitPreset.update).not.toHaveBeenCalled();
  });

  it('deletes preset with documents.manage', async () => {
    permissionKeys = ['documents.manage'];
    (prismaMock.documentSplitPreset.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    const response = await request(app)
      .delete(`/api/companies/${companyId}/documents/split-pdf-presets/preset-2`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(prismaMock.documentSplitPreset.deleteMany).toHaveBeenCalledWith({
      where: { id: 'preset-2', company_id: companyId },
    });
  });
});
