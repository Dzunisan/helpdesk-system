import nodemailer, { type Transporter } from "nodemailer";
import "../config/env";

/**
 * One SMTP transport for every email the helpdesk sends (welcome, password reset, ticket updates).
 * Locally this points at a Mailtrap sandbox inbox: mail is caught there and never reaches real people.
 * Settings come from Backend/.env: EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS, EMAIL_FROM.
 */
let transporter: Transporter | null = null;

export const isEmailConfigured = (): boolean =>
    Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

export const getTransport = (): Transporter => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE === "true",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        // One log line per email, success or failure, so the backend terminal shows every send
        const send = transporter.sendMail.bind(transporter);
        transporter.sendMail = (async (options: Parameters<typeof send>[0]) => {
            const label = `"${options.subject}" to ${String(options.to)}`;
            try {
                const info = await send(options);
                console.log(`[email] Sent ${label} via ${process.env.EMAIL_HOST} (${info.response})`);
                return info;
            } catch (error) {
                console.error(`[email] FAILED ${label}: ${(error as Error).message}`);
                throw error;
            }
        }) as typeof transporter.sendMail;
        console.log(`[email] Using ${process.env.EMAIL_HOST}:${Number(process.env.EMAIL_PORT) || 587} as ${process.env.EMAIL_USER}`);
    }
    return transporter;
};

/** EMAIL_FROM when set (SMTP usernames like Mailtrap's aren't addresses), otherwise EMAIL_USER */
export const fromAddress = (): string =>
    `"Mzansi Freight Helpdesk" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`;

export const clientUrl = (): string => process.env.CLIENT_URL || "http://localhost:5173";
