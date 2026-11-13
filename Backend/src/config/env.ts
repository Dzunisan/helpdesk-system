import dotenv from "dotenv";

dotenv.config();

// Read required secrets once at startup. There is deliberately no fallback value:
// a missing JWT_SECRET would let anyone forge a session cookie.
const readRequired = (name: string): string => {
    const value = process.env[name];
    if (!value || value.trim() === "") {
        console.error(`Missing required environment variable ${name}. Add it to Backend/.env (see .env.example) and restart.`);
        process.exit(1);
    }
    return value;
};

export const JWT_SECRET: string = readRequired("JWT_SECRET");
