-- Mini Anveshana: Fix registration workflow to remove approval/rejection step.
-- All registrations now go directly to 'registered' status.
-- Existing records are migrated to 'registered' if they were in old statuses.

-- Step 1: Migrate existing data to new status values
UPDATE teams SET status = 'registered' 
WHERE status IN ('submitted', 'under_review', 'approved');

UPDATE teams SET status = 'registered' 
WHERE status = 'rejected';

-- Step 2: Drop the old constraint properly
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;

-- Step 3: Add the new constraint with only 'draft' and 'registered'
ALTER TABLE teams ADD CONSTRAINT teams_status_check CHECK (status IN ('draft', 'registered'));

-- Step 4: Update the default value
ALTER TABLE teams ALTER COLUMN status SET DEFAULT 'registered';
