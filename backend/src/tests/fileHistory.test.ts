import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { normalizeFileHistoryActorId, appendFileHistoryEvent, FILE_HISTORY_EVENT_TYPE } from '../lib/fileHistory';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    file: { findFirst: jest.fn() },
    fileHistoryEvent: { findMany: jest.fn(), create: jest.fn() },
    profileGroupMember: { findMany: jest.fn() },
    documentPermissionRule: { count: jest.fn(), findMany: jest.fn() },
    filesMetadataValue: { findMany: jest.fn() },
  },
}));

describe('fileHistory lib', () => {
  it('normalizeFileHistoryActorId returns null for super-admin API id', async () => {
    const { SUPER_ADMIN_API_USER_ID } = await import('../middleware/auth');
    expect(normalizeFileHistoryActorId(SUPER_ADMIN_API_USER_ID)).toBeNull();
  });

  it('normalizeFileHistoryActorId accepts a valid UUID', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(normalizeFileHistoryActorId(id)).toBe(id);
  });

  it('appendFileHistoryEvent calls prisma create', async () => {
    (prisma.fileHistoryEvent.create as jest.Mock).mockResolvedValue({ id: 'h1' });
    await appendFileHistoryEvent({
      companyId: 'cccccccc-dddd-eeee-ffff-000000000001',
      fileId: 'dddddddd-eeee-ffff-0000-111111111111',
      eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
      actorId: null,
      details: { x: 1 },
    });
    expect(prisma.fileHistoryEvent.create).toHaveBeenCalled();
  });
});

describe('GET /api/companies/:companyId/files/:fileId/history', () => {
  const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const companyId = 'cccccccc-dddd-eeee-ffff-000000000001';
  const fileId = 'dddddddd-eeee-ffff-0000-111111111111';
  const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'test-secret');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      email: 'a@b.com',
      profile: { admin_role: { super_admin: false } },
    });
  });

  it('returns 200 with events for company admin', async () => {
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
      user_id: userId,
      company_id: companyId,
      role: 'company_admin',
    });
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: fileId,
      folder_id: null,
      is_archived: false,
    });
    (prisma.fileHistoryEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'e1',
        event_type: 'file_uploaded',
        created_at: new Date('2025-01-01T00:00:00.000Z'),
        details: null,
        actor: { id: userId, email: 'a@b.com', full_name: 'Alice' },
      },
    ]);

    const res = await request(app)
      .get(`/api/companies/${companyId}/files/${fileId}/history`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].eventType).toBe('file_uploaded');
    expect(res.body.events[0].actor?.email).toBe('a@b.com');
    expect(res.body.events[0].actor?.fullName).toBe('Alice');
  });

  it('returns 403 when user lacks documents.view', async () => {
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
      user_id: userId,
      company_id: companyId,
      role: 'user',
      custom_role: null,
    });

    const res = await request(app)
      .get(`/api/companies/${companyId}/files/${fileId}/history`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 when file is missing', async () => {
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
      user_id: userId,
      company_id: companyId,
      role: 'company_admin',
    });
    (prisma.file.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/companies/${companyId}/files/${fileId}/history`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
