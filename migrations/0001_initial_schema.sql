-- Mini Anveshana - Core Schema
-- =========================================================

-- ---------- Reference / config tables ----------

CREATE TABLE IF NOT EXISTS event_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  event_name TEXT NOT NULL DEFAULT 'Mini Anveshana',
  tagline TEXT NOT NULL DEFAULT 'Bring Your Idea. Build Your Solution.',
  event_date TEXT,                       -- '[ADD EVENT DATE]' if not set
  venue TEXT,
  registration_deadline TEXT,
  project_deadline TEXT,
  team_size_min INTEGER NOT NULL DEFAULT 2,
  team_size_max INTEGER NOT NULL DEFAULT 4,
  contact_email TEXT,
  registration_open INTEGER NOT NULL DEFAULT 1,     -- boolean
  late_submission_allowed INTEGER NOT NULL DEFAULT 0,
  results_published INTEGER NOT NULL DEFAULT 0,
  certificates_enabled INTEGER NOT NULL DEFAULT 0,
  module_projects_public INTEGER NOT NULL DEFAULT 1,
  module_schedule_public INTEGER NOT NULL DEFAULT 1,
  scoring_formula TEXT NOT NULL DEFAULT 'average',   -- 'average' | 'best' | 'sum'
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO event_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  max_score INTEGER NOT NULL DEFAULT 20,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Users / auth / roles ----------

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','organizer','evaluator','super_admin')),
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,               -- random token (session id)
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ---------- Colleges ----------

CREATE TABLE IF NOT EXISTS colleges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  university TEXT,
  city TEXT,
  state TEXT,
  coordinator_name TEXT,
  coordinator_email TEXT,
  coordinator_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, city)
);

-- ---------- Teams / Registrations ----------

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT NOT NULL UNIQUE,      -- ANV-2026-00001
  team_name TEXT NOT NULL,
  college_id INTEGER NOT NULL REFERENCES colleges(id),
  department TEXT,
  leader_user_id INTEGER REFERENCES users(id),
  leader_name TEXT NOT NULL,
  leader_email TEXT NOT NULL,
  leader_usn TEXT,
  leader_phone TEXT,
  status TEXT NOT NULL DEFAULT 'submitted'
      CHECK (status IN ('draft','submitted','under_review','approved','rejected')),
  rejection_reason TEXT,
  qr_token TEXT NOT NULL UNIQUE,              -- opaque secure token embedded in QR
  checked_in INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT,
  checked_in_by INTEGER REFERENCES users(id),
  consent_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_teams_college ON teams(college_id);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_qr ON teams(qr_token);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  usn TEXT,
  department TEXT,
  year TEXT,
  is_leader INTEGER NOT NULL DEFAULT 0,
  invitation_status TEXT NOT NULL DEFAULT 'accepted'
      CHECK (invitation_status IN ('pending','accepted','declined')),
  invitation_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_members_team ON team_members(team_id);

CREATE TABLE IF NOT EXISTS faculty_coordinators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  department TEXT,
  email TEXT,
  phone TEXT
);

-- ---------- Projects ----------

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id),
  title TEXT NOT NULL,
  problem_statement TEXT,
  solution_description TEXT,
  features TEXT,
  technologies TEXT,           -- comma separated tags
  architecture TEXT,
  expected_outcome TEXT,
  future_scope TEXT,
  demo_video_url TEXT,
  github_url TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
      CHECK (status IN ('not_started','draft','submitted','reviewed')),
  is_approved_public INTEGER NOT NULL DEFAULT 0,   -- shown on public showcase
  final_score REAL,                                -- snapshotted when admin publishes results
  final_rank INTEGER,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('abstract','presentation','image','other')),
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_project ON project_files(project_id);

-- ---------- Schedule / Announcements ----------

CREATE TABLE IF NOT EXISTS event_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_time TEXT NOT NULL,     -- ISO or display string
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category_id INTEGER REFERENCES categories(id),
  stage TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  created_by INTEGER REFERENCES users(id),
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_announce_active ON announcements(is_active);

-- ---------- Evaluators / Evaluations ----------

CREATE TABLE IF NOT EXISTS evaluators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization TEXT,
  expertise TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluator_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_id INTEGER NOT NULL REFERENCES evaluators(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by INTEGER REFERENCES users(id),
  UNIQUE(evaluator_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_assign_evaluator ON evaluator_assignments(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_assign_project ON evaluator_assignments(project_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES evaluator_assignments(id) ON DELETE CASCADE,
  evaluator_id INTEGER NOT NULL REFERENCES evaluators(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  total_score REAL,
  strengths TEXT,
  suggestions TEXT,
  comments TEXT,
  submitted_at TEXT,
  reopened_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);            
CREATE INDEX IF NOT EXISTS idx_eval_project ON evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_eval_status ON evaluations(status);

CREATE TABLE IF NOT EXISTS evaluation_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES evaluation_criteria(id),
  score REAL NOT NULL DEFAULT 0,
  UNIQUE(evaluation_id, criterion_id)
);

-- ---------- Check-ins (attendance log, supports re-scans / audit) ----------

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scanned_by INTEGER REFERENCES users(id),
  checkin_time TEXT NOT NULL DEFAULT (datetime('now')),
  result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','duplicate','invalid'))
);
CREATE INDEX IF NOT EXISTS idx_checkins_team ON checkins(team_id);

-- ---------- Certificates ----------

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_id TEXT NOT NULL UNIQUE,     -- public verification code e.g. MA26-CERT-000123
  team_id INTEGER NOT NULL REFERENCES teams(id),
  member_id INTEGER REFERENCES team_members(id),
  recipient_name TEXT NOT NULL,
  cert_type TEXT NOT NULL DEFAULT 'participation' CHECK (cert_type IN ('participation','winner','runner_up','special_mention')),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_available INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cert_team ON certificates(team_id);

CREATE TABLE IF NOT EXISTS certificate_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_id TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hint TEXT
);

-- ---------- Audit log ----------

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
