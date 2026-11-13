-- 006: a small key/value table for switches the app reads at run time.
--   hold_breach_alerts_for_demo - written only by the demo seed (scripts/seed.ts). While it is set,
--     the on-read jobs (a queue or dashboard loading) skip breach alerts, so the seeded overdue
--     HD-1050 raises its one alert when the System Admin clicks "Run jobs now" (p.30 step 10),
--     not when Thabo opens his queue in step 3. The first "Run jobs now" (or cron run) clears it.
--     A database that was never seeded has no row, so alerts run on every read as p.18 says.
-- Never edit it once applied: add 007_... instead.
CREATE TABLE IF NOT EXISTS app_setting (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT 'true'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
