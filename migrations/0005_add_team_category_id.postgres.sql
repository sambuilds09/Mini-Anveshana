-- Migration 0005: Add category_id foreign key to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);
CREATE INDEX IF NOT EXISTS idx_teams_category ON teams(category_id);
