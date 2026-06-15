/**
 * Email service unit tests (optional per plan).
 * Minimal test: global setup mocks email.service; controller tests cover usage.
 * Full unit tests (sendInvitation with mocked SendGrid) would require loading
 * the real service without the global mock.
 */
import { emailService } from '../services/email.service';

describe('email.service', () => {
  it('is mocked in test env and exposes expected interface', () => {
    expect(emailService).toBeDefined();
    expect(typeof (emailService as any).sendInvitation).toBe('function');
  });
});
