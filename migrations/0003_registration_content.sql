-- Mini Anveshana registration/content improvements.
-- Apply only after review. This migration does not seed data.

ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check CHECK (status IN ('draft', 'registered', 'submitted', 'under_review', 'approved', 'rejected'));

ALTER TABLE team_members ALTER COLUMN email DROP NOT NULL;
ALTER TABLE team_members ALTER COLUMN department DROP NOT NULL;
ALTER TABLE team_members ALTER COLUMN year DROP NOT NULL;

ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS home_description TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS hero_text TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS home_highlights TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS rules_eligibility TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS rules_registration TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS rules_projects TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS rules_submission TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS rules_evaluation TEXT;
ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS rules_general TEXT;

ALTER TABLE event_schedule ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE event_schedule ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE event_schedule ADD COLUMN IF NOT EXISTS end_time TEXT;

CREATE INDEX IF NOT EXISTS idx_teams_registration_id ON teams(registration_id);
