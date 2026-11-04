BEGIN;

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE INTEGER USING (
  CASE "role"::text
    WHEN 'CLIENT' THEN 1
    WHEN 'ADMIN' THEN 2
    WHEN 'MANAGER' THEN 3
    WHEN 'SUPER_ADMIN' THEN 4
  END
);
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 1;
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" >= 1);
DROP TYPE "UserRole";

-- Preserve existing automatic group rules that filter by profile.
UPDATE user_groups
SET rules = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN rule->>'source' = 'user' AND rule->>'field' = 'role'
      AND rule->>'value' IN ('CLIENT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN')
    THEN jsonb_set(rule, '{value}', to_jsonb(CASE rule->>'value'
      WHEN 'CLIENT' THEN 1 WHEN 'ADMIN' THEN 2 WHEN 'MANAGER' THEN 3 WHEN 'SUPER_ADMIN' THEN 4 END))
    ELSE rule END ORDER BY position
  ), '[]'::jsonb)
  FROM jsonb_array_elements(rules) WITH ORDINALITY AS entry(rule, position)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(rules) AS rule
  WHERE rule->>'source' = 'user' AND rule->>'field' = 'role'
);

COMMIT;
