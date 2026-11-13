-- 005: macro titles are unique per department whatever the letter case (S7), so the picker never
--      shows "Sage: password re-sync steps" next to "sage: password re-sync steps".
--      The service checks this too (409); the index is the backstop. If a database already holds
--      titles that differ only in case, the index is skipped with a notice instead of failing
--      the migration (rename one of them, then add the index by hand).
-- Never edit it once applied: add 006_... instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM canned_response GROUP BY department_id, lower(title) HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'canned_response has titles that differ only in case; unique index not created';
  ELSE
    CREATE UNIQUE INDEX canned_response_department_title_ci_unique
      ON canned_response (department_id, lower(title));
  END IF;
END
$$;
