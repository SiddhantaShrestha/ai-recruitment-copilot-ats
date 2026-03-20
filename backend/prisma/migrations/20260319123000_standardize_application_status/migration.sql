-- Standardize application pipeline statuses.
-- Backward compatible behavior:
-- - SCREENING_PENDING and SCREENING_IN_PROGRESS are mapped to SCREENED.
-- After this migration, the enum contains only:
-- APPLIED, SCREENED, SHORTLISTED, INTERVIEW, OFFER, HIRED, REJECTED.

BEGIN;

-- 1) Map legacy values still present in the DB.
UPDATE "Application"
SET "status" = 'SCREENED'
WHERE "status" IN ('SCREENING_PENDING', 'SCREENING_IN_PROGRESS');

-- 2) Create the new strict enum type.
CREATE TYPE "ApplicationStatus_new" AS ENUM (
  'APPLIED',
  'SCREENED',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED'
);

-- 3) Alter the column to use the new enum type.
ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Application"
  ALTER COLUMN "status"
  TYPE "ApplicationStatus_new"
  USING ("status"::text::"ApplicationStatus_new");

-- 4) Replace old enum type.
DROP TYPE "ApplicationStatus";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";

-- 5) Restore default.
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'APPLIED';

COMMIT;

