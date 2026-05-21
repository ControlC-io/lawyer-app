import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@picobello.app'; 
const APP_URL = process.env.APP_URL || 'http://localhost';
let configuredApiKeyLength = 0;
export type WorkflowEmailAttachment = {
  content: string;
  filename: string;
  type?: string;
  disposition?: 'attachment' | 'inline';
};

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

function sanitizeEmailAttachments(attachments: WorkflowEmailAttachment[] | undefined): WorkflowEmailAttachment[] {
  if (!attachments || attachments.length === 0) return [];
  return attachments
    .filter((attachment) =>
      attachment &&
      typeof attachment.content === 'string' &&
      attachment.content.length > 0 &&
      typeof attachment.filename === 'string' &&
      attachment.filename.trim().length > 0
    )
    .map((attachment) => ({
      content: attachment.content,
      filename: attachment.filename.trim(),
      type: attachment.type,
      disposition: attachment.disposition || 'attachment',
    }));
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color: #0066cc; text-decoration: underline; word-break: break-all;">$1</a>'
    )
    .replace(/\n/g, '<br/>');
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
    const subject = `You have been invited to join ${companyName} on Picobello`;

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Picobello' },
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Join ${companyName}</h2>
          <p style="color: #555; font-size: 16px;">Hello,</p>
          <p style="color: #555; font-size: 16px;">You have been invited to join <strong>${companyName}</strong> on Picobello.</p>
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

  /**
   * Send assignment notification email
   * @param email Recipient email
   * @param workflowName Workflow name
   * @param stepName Step name
   * @param executionId Execution ID
   */
  async sendAssignmentNotification(
    email: string,
    workflowName: string,
    stepName: string,
    executionId: string,
    options?: {
      subject?: string;
      content?: string;
      buttonLabel?: string;
    }
  ): Promise<void> {
    if (!ensureSendGridConfigured('sendAssignmentNotification')) {
      return;
    }

    const executionLink = `${APP_URL}/workflows/executions/${executionId}`;
    const subject = options?.subject?.trim() || `New task assigned: ${stepName}`;
    const defaultContent = `You have been assigned to complete a step in ${workflowName}.\nStep: ${stepName}`;
    const content = options?.content?.trim() || defaultContent;
    const contentHtml = textToHtml(content);
    const buttonLabel = options?.buttonLabel?.trim() || 'View Task';

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Picobello' },
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">New Task Assigned</h2>
          <p style="color: #555; font-size: 16px;">${contentHtml}</p>
          <div style="margin: 35px 0; text-align: center;">
            <a href="${executionLink}" style="background-color: #000; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">${escapeHtml(buttonLabel)}</a>
          </div>
          <p style="color: #777; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #0066cc; font-size: 14px; word-break: break-all;">${executionLink}</p>
        </div>
      `,
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    };

    try {
      logEmailAttempt('sendAssignmentNotification', email, subject);
      await sgMail.send(msg);
      console.log(`Assignment notification sent to ${email}`);
    } catch (error) {
      logEmailError('sendAssignmentNotification', error, email, subject);
      throw new Error('Failed to send assignment notification');
    }
  },

  /**
   * Send demo request notification to admin
   * @param name Requester name
   * @param email Requester email
   * @param company Requester company
   * @param message Additional message
   */
  async sendDemoRequest(
    name: string,
    email: string,
    company: string,
    message?: string
  ): Promise<void> {
    if (!ensureSendGridConfigured('sendDemoRequest')) {
      return;
    }
    const subject = `Demo Request from ${name} (${company})`;

    const msg = {
      to: FROM_EMAIL, // Send to admin
      from: { email: FROM_EMAIL, name: 'Picobello Demo Requests' },
      replyTo: email,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">New Demo Request</h2>
          <p style="color: #555; font-size: 16px;"><strong>Name:</strong> ${name}</p>
          <p style="color: #555; font-size: 16px;"><strong>Email:</strong> ${email}</p>
          <p style="color: #555; font-size: 16px;"><strong>Company:</strong> ${company}</p>
          ${message ? `<p style="color: #555; font-size: 16px;"><strong>Message:</strong><br/>${message}</p>` : ''}
        </div>
      `,
    };

    try {
      logEmailAttempt('sendDemoRequest', FROM_EMAIL, subject);
      await sgMail.send(msg);
      console.log(`Demo request notification sent for ${email}`);
    } catch (error) {
      logEmailError('sendDemoRequest', error, FROM_EMAIL, subject);
      throw new Error('Failed to send demo request');
    }
  },

  /**
   * Send feedback to admin
   * @param email Sender email
   * @param subject Feedback subject
   * @param feedback Feedback message
   */
  async sendFeedback(
    email: string,
    subject: string,
    feedback: string
  ): Promise<void> {
    if (!ensureSendGridConfigured('sendFeedback')) {
      return;
    }
    const mailSubject = `Feedback: ${subject}`;

    const msg = {
      to: FROM_EMAIL, // Send to admin
      from: { email: FROM_EMAIL, name: 'Picobello Feedback' },
      replyTo: email,
      subject: mailSubject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">New Feedback</h2>
          <p style="color: #555; font-size: 16px;"><strong>From:</strong> ${email}</p>
          <p style="color: #555; font-size: 16px;"><strong>Subject:</strong> ${subject}</p>
          <p style="color: #555; font-size: 16px;"><strong>Feedback:</strong><br/>${feedback}</p>
        </div>
      `,
    };

    try {
      logEmailAttempt('sendFeedback', FROM_EMAIL, mailSubject);
      await sgMail.send(msg);
      console.log(`Feedback sent from ${email}`);
    } catch (error) {
      logEmailError('sendFeedback', error, FROM_EMAIL, mailSubject);
      throw new Error('Failed to send feedback');
    }
  },

  /**
   * Send external form link via email
   * @param email Recipient email
   * @param stepName Step name
   * @param token External step token
   */
  async sendExternalFormLink(
    email: string,
    stepName: string,
    token: string
  ): Promise<void> {
    if (!ensureSendGridConfigured('sendExternalFormLink')) {
      return;
    }

    const formLink = `${APP_URL}/external/form/${token}`;
    const subject = `Action Required: ${stepName}`;

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Picobello' },
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Action Required</h2>
          <p style="color: #555; font-size: 16px;">You have been requested to complete: <strong>${stepName}</strong></p>
          <p style="color: #555; font-size: 16px;">Click the button below to complete the form:</p>
          <div style="margin: 35px 0; text-align: center;">
            <a href="${formLink}" style="background-color: #000; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Complete Form</a>
          </div>
          <p style="color: #777; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="color: #0066cc; font-size: 14px; word-break: break-all;">${formLink}</p>
        </div>
      `,
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    };

    try {
      logEmailAttempt('sendExternalFormLink', email, subject);
      await sgMail.send(msg);
      console.log(`External form link sent to ${email}`);
    } catch (error) {
      logEmailError('sendExternalFormLink', error, email, subject);
      throw new Error('Failed to send external form link');
    }
  },

  async sendWorkflowActionEmail(
    email: string,
    subject: string,
    html: string,
    options?: {
      text?: string;
      attachments?: WorkflowEmailAttachment[];
    }
  ): Promise<void> {
    if (!ensureSendGridConfigured('sendWorkflowActionEmail')) {
      return;
    }

    const sanitizedSubject = subject.trim();
    const sanitizedHtml = html.trim();
    const attachments = sanitizeEmailAttachments(options?.attachments);
    const text = options?.text?.trim();

    const msg: sgMail.MailDataRequired = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Picobello' },
      subject: sanitizedSubject,
      html: sanitizedHtml,
      ...(text ? { text } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    };

    try {
      logEmailAttempt('sendWorkflowActionEmail', email, sanitizedSubject);
      await sgMail.send(msg);
      console.log(`Workflow action email sent to ${email}`);
    } catch (error) {
      logEmailError('sendWorkflowActionEmail', error, email, sanitizedSubject);
      throw new Error('Failed to send workflow action email');
    }
  },
};
