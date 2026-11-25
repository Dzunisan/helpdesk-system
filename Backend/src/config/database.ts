import { Pool, PoolClient } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Hosted (Vercel + Neon): DATABASE_URL. Local: the DB_* variables.
export const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 }
        : {
              user: process.env.DB_USER,
              host: process.env.DB_HOST,
              database: process.env.DB_DATABASE,
              password: process.env.DB_PASSWORD,
              port: parseInt(process.env.DB_PORT || "26131"),
              // A local Postgres (localhost or 127.0.0.1, as in the db scripts) has no SSL
              ssl: ['localhost', '127.0.0.1'].includes(process.env.DB_HOST || '') ? false : {
                 rejectUnauthorized: false
              }
          }
)


export const query = (text: string, params?: any[]) => pool.query(text, params)

/**
 * Runs `fn` inside one database transaction and returns its result. COMMIT when it resolves,
 * ROLLBACK when it throws (the error is re-thrown). Every ticket mutation and its logEvent()
 * call share the client this passes in, so the change and its timeline row land together.
 * @example
 *   const ticket = await withTransaction(async (client) => {
 *     const { rows } = await client.query("UPDATE ticket SET ... RETURNING *", [...]);
 *     await logEvent(client, { ticketId, actorId: user.user_id, type: "claimed", to: "Open" });
 *     return rows[0];
 *   });
 */
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const testDbConnection = async () => {
    try{
        const client = await pool.connect();
        console.log("Database connection successful");
        client.release();
    }
    catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1)
    }
}