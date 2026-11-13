import { clientUrl } from "./smtp";
import { escapeHtml } from "./escapeHtml";
import { sendDirectEmail } from "../services/outbox";

const resetHtml = (resetLink: string) => `
      <p>You requested a password reset.</p>
      <p><a href="${escapeHtml(resetLink)}">Click here to choose a new password</a> (valid for 30 minutes).</p>
      <p>If you didn't request this, you can ignore this email.</p>
    `;

/**
 * The password reset email. Like every email it is an outbox row (S9): sent at once through
 * services/outbox.ts sendDirectEmail(), recorded without the reset link. Throws when the send failed.
 */
export const sendPasswordResetEmail = async (to: string, token: string) => {
  const resetLink = `${clientUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  return sendDirectEmail({
    to,
    subject: "Reset your Help Desk password",
    text: `Hi,

Here is your link to reset your Help Desk password. It expires in 30 minutes:

${resetLink}

Didn't request this? Ignore this email. Your current password will keep working.`,
    html: resetHtml(resetLink),
    // The outbox keeps the email without the link: whoever holds it could reset the password
    storedHtml: resetHtml(`${clientUrl()}/reset-password?token=(hidden)`),
  });
};
