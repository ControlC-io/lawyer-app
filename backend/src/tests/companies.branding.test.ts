import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { storageService } from '../services/storage.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    userCompany: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../services/storage.service', () => ({
  storageService: {
    getBucketName: jest.fn().mockReturnValue('floowly'),
    downloadFile: jest.fn(),
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  },
}));

describe('Company Internal Branding Endpoints', () => {
  const superAdminApiKey = 'test-super-admin-key';
  const companyId = 'company-123';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPER_ADMIN_API_KEY = superAdminApiKey;
    (storageService.getBucketName as jest.Mock).mockReturnValue('floowly');
  });

  describe('GET /api/companies/:companyId', () => {
    it('returns internal branding fields with internal logo API URL', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: companyId,
        name: 'Acme Inc',
        created_at: new Date().toISOString(),
        api_key: 'api-key',
        is_active: true,
        slug: 'acme',
        logo_url: null,
        logo_storage_path: null,
        internal_logo_url: null,
        internal_logo_storage_path: `internal-logos/${companyId}/logo.png`,
        internal_primary_color: '#3366FF',
        portal_description: null,
        portal_primary_color: null,
        portal_enabled: false,
      });
      const response = await request(app)
        .get(`/api/companies/${companyId}`)
        .set('x-super-admin-api-key', superAdminApiKey);

      expect(response.status).toBe(200);
      expect(response.body.internal_logo_url).toBe(`/api/companies/${companyId}/internal-logo`);
      expect(response.body.internal_primary_color).toBe('#3366FF');
    });
  });

  describe('PATCH /api/companies/:companyId', () => {
    it('rejects invalid internal primary color', async () => {
      const response = await request(app)
        .patch(`/api/companies/${companyId}`)
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ internal_primary_color: 'blue' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid color');
    });
  });

  describe('POST /api/companies/:companyId/internal-logo', () => {
    it('uploads internal logo and returns internal logo API URL', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        internal_logo_storage_path: null,
      });
      (prisma.company.update as jest.Mock).mockResolvedValue({});
      const response = await request(app)
        .post(`/api/companies/${companyId}/internal-logo`)
        .set('x-super-admin-api-key', superAdminApiKey)
        .attach('file', Buffer.from('fake-image-content'), {
          filename: 'logo.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(200);
      expect(response.body.internal_logo_url).toBe(`/api/companies/${companyId}/internal-logo`);
      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: companyId },
          data: expect.objectContaining({
            internal_logo_storage_path: expect.stringContaining(`internal-logos/${companyId}/logo.`),
            internal_logo_url: null,
          }),
        })
      );
    });
  });
});
