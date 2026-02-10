import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@floowly.app';
const APP_URL = process.env.APP_URL || 'http://localhost';

// Initialize SendGrid only if API key is provided
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  console.warn('SENDGRID_API_KEY not set. Email functionality will be disabled.');
}

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
    if (!SENDGRID_API_KEY) {
      console.warn('Email not sent - SENDGRID_API_KEY not configured');
      return;
    }

    const inviteLink = `${APP_URL}/accept-invitation?token=${token}`;

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Floowly' },
      subject: `You have been invited to join ${companyName} on Floowly`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Join ${companyName}</h2>
          <p style="color: #555; font-size: 16px;">Hello,</p>
          <p style="color: #555; font-size: 16px;">You have been invited to join <strong>${companyName}</strong> on Floowly.</p>
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
      await sgMail.send(msg);
      console.log(`Invitation email sent to ${email}`);
    } catch (error) {
      console.error('Error sending invitation email:', error);
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
    executionId: string
  ): Promise<void> {
    if (!SENDGRID_API_KEY) {
      console.warn('Email not sent - SENDGRID_API_KEY not configured');
      return;
    }

    const executionLink = `${APP_URL}/workflows/executions/${executionId}`;

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Floowly' },
      subject: `New task assigned: ${stepName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">New Task Assigned</h2>
          <p style="color: #555; font-size: 16px;">You have been assigned to complete a step in <strong>${workflowName}</strong>.</p>
          <p style="color: #555; font-size: 16px;"><strong>Step:</strong> ${stepName}</p>
          <div style="margin: 35px 0; text-align: center;">
            <a href="${executionLink}" style="background-color: #000; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Task</a>
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
      await sgMail.send(msg);
      console.log(`Assignment notification sent to ${email}`);
    } catch (error) {
      console.error('Error sending assignment notification:', error);
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
    if (!SENDGRID_API_KEY) {
      console.warn('Email not sent - SENDGRID_API_KEY not configured');
      return;
    }

    const msg = {
      to: FROM_EMAIL, // Send to admin
      from: { email: FROM_EMAIL, name: 'Floowly Demo Requests' },
      replyTo: email,
      subject: `Demo Request from ${name} (${company})`,
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
      await sgMail.send(msg);
      console.log(`Demo request notification sent for ${email}`);
    } catch (error) {
      console.error('Error sending demo request:', error);
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
    if (!SENDGRID_API_KEY) {
      console.warn('Email not sent - SENDGRID_API_KEY not configured');
      return;
    }

    const msg = {
      to: FROM_EMAIL, // Send to admin
      from: { email: FROM_EMAIL, name: 'Floowly Feedback' },
      replyTo: email,
      subject: `Feedback: ${subject}`,
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
      await sgMail.send(msg);
      console.log(`Feedback sent from ${email}`);
    } catch (error) {
      console.error('Error sending feedback:', error);
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
    if (!SENDGRID_API_KEY) {
      console.warn('Email not sent - SENDGRID_API_KEY not configured');
      return;
    }

    const formLink = `${APP_URL}/external/steps/${token}`;

    const msg = {
      to: email,
      from: { email: FROM_EMAIL, name: 'Floowly' },
      subject: `Action Required: ${stepName}`,
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
      await sgMail.send(msg);
      console.log(`External form link sent to ${email}`);
    } catch (error) {
      console.error('Error sending external form link:', error);
      throw new Error('Failed to send external form link');
    }
  },
};
