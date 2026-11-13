import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "26131"),
    // A local Postgres (localhost or 127.0.0.1, as in the db scripts) has no SSL
    ssl: ['localhost', '127.0.0.1'].includes(process.env.DB_HOST || '') ? false : {
       rejectUnauthorized: false
    }
})


export const query = (text: string, params?: any[]) => pool.query(text, params)

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