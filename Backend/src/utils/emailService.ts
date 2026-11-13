import { clientUrl, fromAddress, getTransport } from './smtp';
import { escapeHtml } from './escapeHtml';

// Ticket emails (replies, assignments, status changes) are no longer sent from here: since Sprint 2
// (S9) they are notifications queued in the outbox by services/notify.ts and delivered by
// services/outbox.ts sendPending() through the same SMTP transport (utils/smtp.ts).

export const sendTempPasswordEmail = async (email: string, tempPassword: string) => {
    const transporter = getTransport();

    const mailOptions = {
        from: fromAddress(),
        to: email,
        subject: 'Your Helpdesk account is ready',
        text: `Welcome to the Mzansi Freight Helpdesk!\n\nSign in at ${clientUrl()} with this email address and your temporary password: ${tempPassword}\n\nYou'll choose your own password the first time you sign in.`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2>Welcome to the Helpdesk System!</h2>
                <p>Your account has been created successfully.</p>
                <p>Your temporary password is: <strong>${escapeHtml(tempPassword)}</strong></p>
                <p>Sign in at <a href="${escapeHtml(clientUrl())}">${escapeHtml(clientUrl())}</a> with this email address. You'll choose your own password the first time you sign in.</p>
                <p>Best regards,<br/>The Helpdesk Team</p>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
 
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};
