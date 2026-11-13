import { clientUrl } from './smtp';
import { escapeHtml } from './escapeHtml';
import { sendDirectEmail } from '../services/outbox';

// Every email the app sends is an outbox row (S9, briefing p.18):
//   - ticket emails (replies, assignments, status changes, ...) are notifications queued by
//     services/notify.ts and delivered after commit by services/outbox.ts sendPending();
//   - account emails (this welcome email, the password reset in utils/mailer.ts) go out at once
//     through services/outbox.ts sendDirectEmail(), which records them with their secret blanked.
// Both use the one SMTP transport in utils/smtp.ts.

const welcomeHtml = (password: string) => `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2>Welcome to the Helpdesk System!</h2>
                <p>Your account has been created successfully.</p>
                <p>Your temporary password is: <strong>${escapeHtml(password)}</strong></p>
                <p>Sign in at <a href="${escapeHtml(clientUrl())}">${escapeHtml(clientUrl())}</a> with this email address. You'll choose your own password the first time you sign in.</p>
                <p>Best regards,<br/>The Helpdesk Team</p>
            </div>
        `;

/**
 * The welcome email with the temporary password. Returns the outbox status: "SENT", or "SIMULATED"
 * when SMTP isn't configured (the caller then shows the password to the admin once). Throws when
 * the send failed.
 */
export const sendTempPasswordEmail = async (email: string, tempPassword: string) => {
    try {
        return await sendDirectEmail({
            to: email,
            subject: 'Your Helpdesk account is ready',
            text: `Welcome to the Mzansi Freight Helpdesk!\n\nSign in at ${clientUrl()} with this email address and your temporary password: ${tempPassword}\n\nYou'll choose your own password the first time you sign in.`,
            html: welcomeHtml(tempPassword),
            // The outbox keeps the email without the password
            storedHtml: welcomeHtml('(hidden)'),
        });
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};
