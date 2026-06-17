import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
const APP_NAME = process.env.APP_NAME || 'Lexora';
const APP_URL = process.env.APP_URL || 'http://localhost';
let configuredApiKeyLength = 0;

function resolveSendGridApiKey(): string {
  // Prefer runtime value to surface late-loaded env values.
  return process.env.SENDGRID_API_KEY || SENDGRID_API_KEY || '';
}

function getRuntimeEmailEnvState() {
  const runtimeApiKey = process.env.SENDGRID_API_KEY || '';
  const resolvedApiKey = resolveSendGridApiKey();
  return {
    module_api_key_present: !!SENDGRID_API_KEY,
    module_api_key_length: SENDGRID_API_KEY.length,
    runtime_api_key_present: !!runtimeApiKey,
    runtime_api_key_length: runtimeApiKey.length,
    resolved_api_key_present: !!resolvedApiKey,
    resolved_api_key_length: resolvedApiKey.length,
    from_email: FROM_EMAIL,
    app_url: APP_URL,
    node_env: process.env.NODE_ENV || 'unknown',
  };
}

function ensureSendGridConfigured(context: string): boolean {
  const apiKey = resolveSendGridApiKey();
  if (!apiKey) {
    console.warn(
      `[email] SendGrid disabled in ${context}: SENDGRID_API_KEY not configured`,
      getRuntimeEmailEnvState()
    );
    return false;
  }

  if (configuredApiKeyLength !== apiKey.length) {
    sgMail.setApiKey(apiKey);
    configuredApiKeyLength = apiKey.length;
    console.log('[email] SendGrid client configured', getRuntimeEmailEnvState());
  }

  return true;
}

function logEmailAttempt(context: string, to: string, subject: string) {
  console.log(`[email] Attempting ${context}`, {
    to,
    from: FROM_EMAIL,
    subject,
    env: getRuntimeEmailEnvState(),
  });
}

function logEmailError(context: string, error: unknown, to: string, subject: string) {
  const err = error as any;
  console.error(`[email] ${context} failed`, {
    to,
    from: FROM_EMAIL,
    subject,
    message: err?.message,
    code: err?.code,
    statusCode: err?.response?.statusCode ?? null,
    sendgridErrors: err?.response?.body?.errors ?? null,
    sendgridResponseBody: err?.response?.body ?? null,
    sendgridResponseHeaders: err?.response?.headers ?? null,
    env: getRuntimeEmailEnvState(),
  });
}

// Initialize SendGrid only if API key is provided
ensureSendGridConfigured('module initialization');

export const emailService = {
  /**
   * Send user invitation email
   * @param email Recipient email
   * @param companyName Company name
   * @param token Invitation token
   */
  async sendInvitation(
    email: string,
    companyName: string,
    token: string
  ): Promise<void> {
    if (!ensureSendGridConfigured('sendInvitation')) {
      return;
    }

    const inviteLink = `${APP_URL}/accept-invitation?token=${token}`;
    const subject = `You have been invited to join ${companyName} on ${APP_NAME}`;

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: APP_NAME },
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Join ${companyName}</h2>
          <p style="color: #555; font-size: 16px;">Hello,</p>
          <p style="color: #555; font-size: 16px;">You have been invited to join <strong>${companyName}</strong> on ${APP_NAME}.</p>
          <p style="color: #555; font-size: 16px;">Click the button below to accept the invitation and get started:</p>
          <div style="margin: 35px 0; text-align: center;">
            <a href="${inviteLink}" style="background-color: #000; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation</a>
          </div>
          <p style="color: #777; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #0066cc; font-size: 14px; word-break: break-all;">${inviteLink}</p>
          <hr style="margin-top: 30px; border: 0; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999; text-align: center;">If you weren't expecting this invitation, you can safely ignore this email.</p>
        </div>
      `,
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    };

    try {
      logEmailAttempt('sendInvitation', email, subject);
      await sgMail.send(msg);
      console.log(`Invitation email sent to ${email}`);
    } catch (error) {
      logEmailError('sendInvitation', error, email, subject);
      throw new Error('Failed to send invitation email');
    }
  },
};

