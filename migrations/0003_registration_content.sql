-- Mini Anveshana registration/content improvements.
-- Apply only after review. This migration does not seed data.

-- Note: The teams status constraint is now properly fixed in migration 0004.
-- This comment documents the evolution: 0001 had draft/submitted/under_review/approved/rejected
-- 0004 simplifies it to just draft/registered since there's no admin approval workflow.

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
