
import { clientUrl, fromAddress, getTransport } from "./smtp";
import { escapeHtml } from "./escapeHtml";


export const sendPasswordResetEmail = async (to: string, token: string) => {
  const resetLink = `${clientUrl()}/reset-password?token=${encodeURIComponent(token)}`;

 return await getTransport().sendMail({
    from: fromAddress(),
    to,
    subject: "Reset your Help Desk password",
    text: `Hi,

Here is your link to reset your Help Desk password. It expires in 30 minutes.

Didn’t request this? Ignore this email. Your current password will keep working.:\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${escapeHtml(resetLink)}">Click here to choose a new password</a> (valid for 30 minutes).</p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  });
};