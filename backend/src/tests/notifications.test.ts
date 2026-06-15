import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    notification: { createMany: jest.fn(), deleteMany: jest.fn() },
  },
}));

describe('Notifications Endpoints', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com', profile: {} };
  const mockToken = jwt.sign({ userId: mockUser.id }, process.env.JWT_SECRET || 'test-secret');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const response = await request(app)
        .delete('/api/notifications/notif-1');

      expect(response.status).toBe(401);
      expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
    });

    it('should return 404 when notification is not found', async () => {
      (prisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const response = await request(app)
        .delete('/api/notifications/notif-missing')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');
    });

    it('should delete notification and return 204', async () => {
      (prisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await request(app)
        .delete('/api/notifications/notif-123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(204);
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { id: 'notif-123', user_id: mockUser.id },
      });
    });
  });
});
