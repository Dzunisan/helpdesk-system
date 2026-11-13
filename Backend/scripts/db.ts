// Shared helpers for the db:* scripts. Reads the same DB_* variables as src/config/database.ts.
import dotenv from "dotenv";
import type { PoolConfig } from "pg";

dotenv.config();

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export function isLocalDb(): boolean {
  return LOCAL_HOSTS.includes(process.env.DB_HOST ?? "");
}

export function dbConfig(): PoolConfig {
  return {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "26131"),
    ssl: isLocalDb() ? false : { rejectUnauthorized: false },
  };
}

// Seed and reset wipe data, so they only ever run against a database on this machine.
export function assertLocalDb(action: string): void {
  if (!isLocalDb()) {
    throw new Error(
      `Refusing to ${action}: DB_HOST is "${process.env.DB_HOST ?? ""}". ` +
        `This only runs when DB_HOST is localhost or 127.0.0.1.`,
    );
  }
}
