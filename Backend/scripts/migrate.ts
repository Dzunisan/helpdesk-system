// Applies every not-yet-applied .sql file in db/migrations, in filename order.
// Each file runs in its own transaction and is recorded in schema_migrations,
// so running this again only applies new files. Run:  npm run db:migrate
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { dbConfig } from "./db";

const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

export async function migrate(): Promise<string[]> {
  const pool = new Pool(dbConfig());
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const done = new Set(
      (await client.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename),
    );
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`${file}: ${(error as Error).message}`);
      }
      applied.push(file);
      console.log(`Applied ${file}`);
    }

    if (applied.length === 0) console.log("Database is up to date, nothing to apply.");
    return applied;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error("Migration failed:", error.message);
    process.exit(1);
  });
}
