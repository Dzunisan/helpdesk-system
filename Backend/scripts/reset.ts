// Rebuilds the local database from scratch: drops everything in the public schema,
// applies every migration, then loads the demo data. Local databases only.
// Run:  npm run db:reset
import { Pool } from "pg";
import { assertLocalDb, dbConfig } from "./db";
import { migrate } from "./migrate";
import { runSeed } from "./seed";

async function reset() {
  assertLocalDb("reset the database");
  const pool = new Pool(dbConfig());
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    console.log(`Dropped and recreated schema public in ${process.env.DB_DATABASE}`);
  } finally {
    await pool.end();
  }
  await migrate();
  await runSeed();
}

reset().catch((error) => {
  console.error("Reset failed:", error.message);
  process.exit(1);
});
