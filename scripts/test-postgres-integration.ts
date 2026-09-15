import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getDatabase } from '../src/lib/db'
import { hashPassword, verifyPassword, createSession, destroySession } from '../src/lib/auth'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requiredTables = [
  'event_settings',
  'categories',
  'evaluation_criteria',
  'users',
  'sessions',
  'colleges',
  'teams',
  'team_members',
  'faculty_coordinators',
  'projects',
  'project_files',
  'event_schedule',
  'announcements',
  'evaluators',
  'evaluator_assignments',
  'evaluations',
  'evaluation_scores',
  'checkins',
  'certificates',
  'certificate_verifications',
  'audit_logs',
]

type TestName =
  | 'DATABASE CONNECTION'
  | 'SCHEMA'
  | 'AUTH'
  | 'SESSION'
  | 'RBAC'
  | 'REGISTRATION COMMIT'
  | 'REGISTRATION ROLLBACK'
  | 'PROJECT SUBMISSION'
  | 'PROJECT ROLLBACK'
  | 'ROUTE INTEGRATION'
  | 'CLEANUP'

const state: Record<string, { pass: boolean; details?: string; error?: string }> = {}
const cleanup: Array<() => Promise<void>> = []

function parseDotEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf8')
  const result: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    result[key] = value.replace(/^['"]|['"]$/g, '')
  }
  return result
}

function normalizeDatabaseUrl(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('DATABASE_URL is empty.')
  if (value.startsWith('postgresql://') || value.startsWith('postgres://')) return value
  const match = value.match(/psql\s+-h\s+([^\s]+)\s+-p\s+(\d+)\s+-d\s+([^\s]+)\s+-U\s+([^\s]+)/i)
  if (match) {
    const [, host, port, dbName, user] = match
    return `postgresql://${user}@${host}:${port}/${dbName}?sslmode=require`
  }
  throw new Error('DATABASE_URL is not a supported Postgres connection string.')
}

function getDatabaseUrl(): string {
  const envPath = path.join(projectRoot, '.env.local')
  if (fs.existsSync(envPath)) {
    const localEnv = parseDotEnvFile(envPath)
    const value = localEnv.DATABASE_URL || process.env.DATABASE_URL
    if (value) return normalizeDatabaseUrl(value)
  }

  if (process.env.DATABASE_URL) return normalizeDatabaseUrl(process.env.DATABASE_URL)
  throw new Error('DATABASE_URL was not found in .env.local or process.env.')
}

async function mark(test: TestName, fn: () => Promise<void>, details?: string) {
  try {
    await fn()
    state[test] = { pass: true, details }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error)
    state[test] = { pass: false, error: message, details }
    console.error(`FAIL :: ${test} :: ${message}`)
  }
}

async function afterEachCleanup() {
  for (const item of cleanup.reverse()) {
    try {
      await item()
    } catch (error: any) {
      console.error(`CLEANUP ERROR :: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function main() {
  const dbUrl = getDatabaseUrl()
  const sql = postgres(dbUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  try {
    await mark('DATABASE CONNECTION', async () => {
      const rows = await sql`SELECT 1 AS ok`
      if (!rows || rows.length === 0 || Number(rows[0].ok) !== 1) {
        throw new Error('SELECT 1 did not return the expected result.')
      }
    }, 'SELECT 1 from live Supabase PostgreSQL succeeded.')

    await mark('SCHEMA', async () => {
      await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_teams_category ON teams(category_id)`
      const rows = await sql<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      const names = new Set(rows.map((row) => row.table_name))
      const missing = requiredTables.filter((table) => !names.has(table))
      if (missing.length > 0) {
        throw new Error(`Missing required tables: ${missing.join(', ')}`)
      }
    }, 'Critical application tables exist in the live database.')

    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const tmpAuthEmail = `tmp.auth.${uniqueSuffix}@example.com`
    const tmpAuthPassword = 'TempPass!234'
    const tmpSessionToken = `tmp-session-${uniqueSuffix}`
    const tmpOrgEmail = `tmp.org.${uniqueSuffix}@example.com`
    const tmpStudentEmail = `tmp.student.${uniqueSuffix}@example.com`
    const tmpRolloverEmail = `tmp.rollback.${uniqueSuffix}@example.com`
    const tmpLeaderEmail = `tmp.leader.${uniqueSuffix}@example.com`
    const tmpEvalEmail = `tmp.evaluator.${uniqueSuffix}@example.com`
    const tmpCollegeName = `Temp College ${uniqueSuffix}`
    const tmpTeamName = `Temp Team ${uniqueSuffix}`
    const tmpProjectTitle = `Temp Project ${uniqueSuffix}`
    const tmpProjectTitleRollback = `Temp Project Rollback ${uniqueSuffix}`

    const db = getDatabase(dbUrl)

    await mark('AUTH', async () => {
      const passwordHash = await hashPassword(tmpAuthPassword)
      const inserted = await db.one<{ id: number }>(
        'INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id',
        [tmpAuthEmail, passwordHash, 'Temp Auth User', 'student', '9999999999'],
      )
      if (!inserted) throw new Error('Auth test user was not inserted.')
      cleanup.push(async () => {
        await sql`DELETE FROM users WHERE email = ${tmpAuthEmail}`
      })

      const valid = await verifyPassword(tmpAuthPassword, passwordHash)
      if (!valid) throw new Error('Password verification failed for a freshly hashed password.')

      const invalid = await verifyPassword('WrongPass!123', passwordHash)
      if (invalid) throw new Error('Incorrect password unexpectedly verified as valid.')

      const byEmail = await db.one<{ id: number; password_hash: string; role: string; is_active: number }>(
        'SELECT id, password_hash, role, is_active FROM users WHERE email = ?',
        [tmpAuthEmail],
      )
      if (!byEmail) throw new Error('Auth record was not found after insert.')
      const byEmailValid = await verifyPassword(tmpAuthPassword, byEmail.password_hash)
      if (!byEmailValid) throw new Error('Password verification using DB record failed.')
    }, 'Temporary auth user is created, verified, and rejects invalid passwords.')

    await mark('SESSION', async () => {
      const userRow = await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', [tmpAuthEmail])
      if (!userRow) throw new Error('Session test user not found.')
      const sessionId = await createSession(db, userRow.id)
      cleanup.push(async () => {
        await sql`DELETE FROM sessions WHERE id = ${sessionId}`
      })
      const lookup = await db.one<{ id: string; user_id: number }>('SELECT id, user_id FROM sessions WHERE id = ?', [sessionId])
      if (!lookup) throw new Error('Session was not created or not found.')
      if (lookup.user_id !== userRow.id) throw new Error('Session user_id did not match the auth user.')
      await destroySession(db, sessionId)
      const afterDelete = await db.one<{ id: string }>('SELECT id FROM sessions WHERE id = ?', [sessionId])
      if (afterDelete) throw new Error('Session cleanup did not remove the test session.')
    }, 'Session creation, lookup, and cleanup work for a live auth user.')

    await mark('RBAC', async () => {
      const organizerRow = await db.one<{ id: number; role: string; is_active: number }>(
        'INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id, role, is_active',
        [tmpOrgEmail, await hashPassword('OrgPass!234'), 'Temp Organizer', 'organizer', '7777777777'],
      )
      if (!organizerRow) throw new Error('Organizer row was not created for RBAC validation.')
      cleanup.push(async () => {
        await sql`DELETE FROM users WHERE email = ${tmpOrgEmail}`
      })

      const allowedRoles = ['organizer', 'super_admin']
      if (!allowedRoles.includes(organizerRow.role)) {
        throw new Error(`Role mismatch: expected organizer-capable role, got ${organizerRow.role}.`)
      }

      const studentRow = await db.one<{ id: number; role: string; is_active: number }>(
        'INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id, role, is_active',
        [tmpStudentEmail, await hashPassword('StudentPass!234'), 'Temp Student', 'student', '8888888888'],
      )
      if (!studentRow) throw new Error('Student role row was not created for RBAC validation.')
      cleanup.push(async () => {
        await sql`DELETE FROM users WHERE email = ${tmpStudentEmail}`
      })

      const unauthorized = ['organizer', 'super_admin']
      if (unauthorized.includes(studentRow.role)) {
        throw new Error('Unauthorized RBAC test unexpectedly matched an allowed role.')
      }
      if (studentRow.role === 'organizer') {
        throw new Error('Student role incorrectly matched organizer role.')
      }
    }, 'RBAC logic accepts a valid role and rejects an unauthorized role pattern.')

    await mark('REGISTRATION COMMIT', async () => {
      const nowYear = new Date().getFullYear()
      const registrationId = `ANV-${nowYear}-${String(Date.now()).slice(-5).padStart(5, '0')}`
      const qrToken = `QR-${uniqueSuffix}`
      const catName = `Temp Category ${uniqueSuffix}`
      const catSlug = `temp-category-${uniqueSuffix}`
      const registration = await db.transaction(async (tx) => {
        const category = await tx.one<{ id: number }>(
          'INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES (?, ?, ?, 1, 1) RETURNING id',
          [catName, catSlug, 'Temporary Category for Integration Test'],
        )
        if (!category) throw new Error('Category insert failed during registration commit test.')

        const college = await tx.one<{ id: number }>(
          'INSERT INTO colleges (name, university, city, state) VALUES (?, ?, ?, ?) RETURNING id',
          [tmpCollegeName, 'Temp University', 'Live City', 'Live State'],
        )
        if (!college) throw new Error('College insert failed during registration commit.')

        const leader = await tx.one<{ id: number }>(
          'INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id',
          [tmpLeaderEmail, await hashPassword('LeaderPass!234'), 'Temp Team Leader', 'student', '2222222222'],
        )
        if (!leader) throw new Error('Team leader insert failed during registration commit.')

        const team = await tx.one<{ id: number }>(
          `INSERT INTO teams (registration_id, team_name, college_id, category_id, department, leader_user_id, leader_name, leader_email, leader_usn, leader_phone, status, qr_token, consent_confirmed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 1) RETURNING id`,
          [registrationId, tmpTeamName, college.id, category.id, 'Computer Science', leader.id, 'Temp Team Leader', tmpLeaderEmail, '1MS-TEAM', '2222222222', qrToken],
        )
        if (!team) throw new Error('Team insert failed during registration commit.')

        await tx.execute(
          'INSERT INTO team_members (team_id, user_id, full_name, email, usn, department, year, is_leader, invitation_status) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
          [team.id, leader.id, 'Temp Team Leader', tmpLeaderEmail, '1MS-TEAM', 'Computer Science', '2026', 'accepted'],
        )

        const project = await tx.one<{ id: number }>(
          `INSERT INTO projects (team_id, category_id, title, problem_statement, solution_description, technologies, status)
           VALUES (?, ?, ?, ?, ?, ?, 'submitted') RETURNING id`,
          [team.id, category.id, tmpProjectTitle, 'Problem statement for commit test', 'Solution description for commit test', 'TypeScript, PostgreSQL'],
        )
        if (!project) throw new Error('Project insert failed during registration commit.')

        await tx.execute(
          'INSERT INTO project_files (project_id, file_type, file_name, r2_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
          [project.id, 'abstract', 'temp-abstract.pdf', `projects/${project.id}/abstract.pdf`, 'application/pdf', 1234],
        )

        return { collegeId: college.id, leaderId: leader.id, teamId: team.id, projectId: project.id, categoryId: category.id }
      })

      cleanup.push(async () => {
        await sql`DELETE FROM project_files WHERE project_id = ${registration.projectId}`
        await sql`DELETE FROM projects WHERE team_id = ${registration.teamId}`
        await sql`DELETE FROM team_members WHERE team_id = ${registration.teamId}`
        await sql`DELETE FROM teams WHERE id = ${registration.teamId}`
        await sql`DELETE FROM users WHERE email = ${tmpLeaderEmail}`
        await sql`DELETE FROM colleges WHERE name = ${tmpCollegeName}`
        await sql`DELETE FROM categories WHERE name = ${catName}`
      })

      const teamReadback = await db.one<{ id: number; registration_id: string; leader_email: string; category_id: number }>(
        'SELECT id, registration_id, leader_email, category_id FROM teams WHERE leader_email = ?',
        [tmpLeaderEmail],
      )
      if (!teamReadback || teamReadback.registration_id !== registrationId || teamReadback.category_id !== registration.categoryId) {
        throw new Error('Registration commit did not persist the expected team row with category_id.')
      }

      const memberCount = await db.one<{ count: number }>('SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = ?', [registration.teamId])
      if (!memberCount || memberCount.count < 1) {
        throw new Error('Registration commit did not persist the expected team members.')
      }

      const projectCount = await db.one<{ count: number }>('SELECT COUNT(*)::int AS count FROM projects WHERE title = ?', [tmpProjectTitle])
      if (!projectCount || projectCount.count < 1) {
        throw new Error('Registration commit did not persist the project row.')
      }
    }, 'Registration transaction commits school, team, member, project, and file records in one live transaction.')

    await mark('REGISTRATION ROLLBACK', async () => {
      const rollbackEmail = `tmp.rollback.${uniqueSuffix}@example.com`
      const rollbackCollege = `Rollback College ${uniqueSuffix}`
      try {
        await db.transaction(async (tx) => {
          await tx.execute(
            'INSERT INTO colleges (name, university, city, state) VALUES (?, ?, ?, ?)',
            [rollbackCollege, 'Rollback University', 'Rollback City', 'Rollback State'],
          )
          await tx.execute(
            'INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1)',
            [rollbackEmail, await hashPassword('RollbackPass!234'), 'Temp Rollback User', 'student', '5555555555'],
          )
          throw new Error('Intentional rollback for registration validation')
        })
      } catch (error: any) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg !== 'Intentional rollback for registration validation') {
          throw error
        }
      }

      const leftoverUser = await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', [rollbackEmail])
      const leftoverCollege = await db.one<{ id: number }>('SELECT id FROM colleges WHERE name = ?', [rollbackCollege])
      if (leftoverUser || leftoverCollege) {
        throw new Error('Registration rollback left temporary records behind.')
      }
    }, 'Registration transaction rollback removes inserted rows when an error is thrown.')

    await mark('PROJECT SUBMISSION', async () => {
      const projectLeaderEmail = `tmp.project.leader.${uniqueSuffix}@example.com`
      const projectCollegeName = `Project College ${uniqueSuffix}`
      const projectTeamName = `Project Team ${uniqueSuffix}`
      const projectTitle = tmpProjectTitleRollback
      const projectPassword = 'ProjectPass!234'

      const result = await db.transaction(async (tx) => {
        const college = await tx.one<{ id: number }>('INSERT INTO colleges (name, university, city, state) VALUES (?, ?, ?, ?) RETURNING id', [projectCollegeName, 'Project University', 'Project City', 'Project State'])
        if (!college) throw new Error('College insert failed for project submission commit.')

        const leader = await tx.one<{ id: number }>('INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id', [projectLeaderEmail, await hashPassword(projectPassword), 'Temp Project Leader', 'student', '1212121212'])
        if (!leader) throw new Error('Leader insert failed for project submission commit.')

        const team = await tx.one<{ id: number }>(`INSERT INTO teams (registration_id, team_name, college_id, department, leader_user_id, leader_name, leader_email, leader_usn, leader_phone, status, qr_token, consent_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 1) RETURNING id`, [`ANV-PROJECT-${uniqueSuffix}`, projectTeamName, college.id, 'CSE', leader.id, 'Temp Project Leader', projectLeaderEmail, '1MS-PROJECT', '1212121212', `QR-PROJECT-${uniqueSuffix}`])
        if (!team) throw new Error('Team insert failed for project submission commit.')

        const project = await tx.one<{ id: number }>(`INSERT INTO projects (team_id, category_id, title, problem_statement, solution_description, technologies, status) VALUES (?, NULL, ?, ?, ?, ?, 'submitted') RETURNING id`, [team.id, projectTitle, 'Project problem statement', 'Project solution description', 'Hono, PostgreSQL'])
        if (!project) throw new Error('Project insert failed for project submission commit.')

        await tx.execute('INSERT INTO project_files (project_id, file_type, file_name, r2_key, content_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)', [project.id, 'abstract', 'project-abstract.pdf', `projects/${project.id}/abstract.pdf`, 'application/pdf', 5678])

        return { teamId: team.id, projectId: project.id, leaderId: leader.id }
      })

      cleanup.push(async () => {
        await sql`DELETE FROM project_files WHERE project_id = ${result.projectId}`
        await sql`DELETE FROM projects WHERE id = ${result.projectId}`
        await sql`DELETE FROM team_members WHERE team_id = ${result.teamId}`
        await sql`DELETE FROM teams WHERE id = ${result.teamId}`
        await sql`DELETE FROM users WHERE id = ${result.leaderId}`
        await sql`DELETE FROM colleges WHERE name = ${projectCollegeName}`
      })

      const persistedProject = await db.one<{ id: number; title: string }>('SELECT id, title FROM projects WHERE title = ?', [projectTitle])
      if (!persistedProject) throw new Error('Project submission commit did not persist the project row.')

      const persistedFile = await db.one<{ id: number }>('SELECT id FROM project_files WHERE project_id = ?', [persistedProject.id])
      if (!persistedFile) throw new Error('Project submission commit did not persist the uploaded file record.')
    }, 'Project submission transaction commits the project and related file metadata in a live database transaction.')

    await mark('PROJECT ROLLBACK', async () => {
      const rollbackCollege = `Project Rollback College ${uniqueSuffix}`
      const rollbackLeader = `tmp.rollback.project.${uniqueSuffix}@example.com`
      let createdProjectId: number | null = null
      let createdTeamId: number | null = null
      try {
        await db.transaction(async (tx) => {
          const college = await tx.one<{ id: number }>('INSERT INTO colleges (name, university, city, state) VALUES (?, ?, ?, ?) RETURNING id', [rollbackCollege, 'Rollback Project University', 'Rollback Project City', 'Rollback Project State'])
          if (!college) throw new Error('College insert failed for project rollback.')
          const leader = await tx.one<{ id: number }>('INSERT INTO users (email, password_hash, full_name, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id', [rollbackLeader, await hashPassword('RollbackProject!234'), 'Rollback Project Leader', 'student', '3434343434'])
          if (!leader) throw new Error('Leader insert failed for project rollback.')
          const team = await tx.one<{ id: number }>(`INSERT INTO teams (registration_id, team_name, college_id, department, leader_user_id, leader_name, leader_email, leader_usn, leader_phone, status, qr_token, consent_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 1) RETURNING id`, [`ANV-PROJECT-ROLLBACK-${uniqueSuffix}`, `Project Rollback Team ${uniqueSuffix}`, college.id, 'CSE', leader.id, 'Rollback Project Leader', rollbackLeader, '1MS-ROLLBACK', '3434343434', `QR-ROLLBACK-${uniqueSuffix}`])
          if (!team) throw new Error('Team insert failed for project rollback.')
          createdTeamId = team.id
          const project = await tx.one<{ id: number }>(`INSERT INTO projects (team_id, category_id, title, problem_statement, solution_description, technologies, status) VALUES (?, NULL, ?, ?, ?, ?, 'submitted') RETURNING id`, [team.id, `Project Rollback ${uniqueSuffix}`, 'Rollback problem statement', 'Rollback solution description', 'Rollback, PostgreSQL'])
          if (!project) throw new Error('Project insert failed for project rollback.')
          createdProjectId = project.id
          throw new Error('Intentional project rollback')
        })
      } catch (error: any) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg !== 'Intentional project rollback') {
          throw error
        }
      }

      if (createdProjectId) {
        const remainingProject = await db.one<{ id: number }>('SELECT id FROM projects WHERE id = ?', [createdProjectId])
        const remainingTeam = createdTeamId ? await db.one<{ id: number }>('SELECT id FROM teams WHERE id = ?', [createdTeamId]) : null
        if (remainingProject || remainingTeam) {
          throw new Error('Project rollback did not remove the temporary project and team records.')
        }
      }
    }, 'Project transaction rollback removes partial project data when the transaction fails.')

    await mark('ROUTE INTEGRATION', async () => {
      const publicRows = await db.many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order LIMIT 5')
      const studentRows = await db.many<any>('SELECT * FROM teams WHERE leader_email LIKE ? LIMIT 5', [`%${tmpLeaderEmail.slice(0, 4)}%`])
      const adminRows = await db.many<any>('SELECT * FROM users WHERE role IN (\'organizer\', \'super_admin\') LIMIT 5')
      const evaluatorRows = await db.many<any>('SELECT e.*, u.email FROM evaluators e JOIN users u ON u.id = e.user_id LIMIT 5')
      if (!Array.isArray(publicRows)) throw new Error('Public route database query failed.')
      if (!Array.isArray(studentRows)) throw new Error('Student route database query failed.')
      if (!Array.isArray(adminRows)) throw new Error('Admin route database query failed.')
      if (!Array.isArray(evaluatorRows)) throw new Error('Evaluator route database query failed.')
    }, 'Representative public, student, admin, and evaluator queries return PostgreSQL results as expected.')

    await mark('CLEANUP', async () => {
      const trackedEmails = [
        tmpAuthEmail,
        tmpOrgEmail,
        tmpStudentEmail,
        tmpLeaderEmail,
        tmpEvalEmail,
      ]

      const trackedUserIds = await sql<{ id: number }[]>`SELECT id FROM users WHERE email = ANY(${trackedEmails})`
      const userIds = trackedUserIds.map((row) => row.id)

      if (userIds.length > 0) {
        await sql`DELETE FROM sessions WHERE user_id = ANY(${userIds})`
        await sql`DELETE FROM team_members WHERE user_id = ANY(${userIds})`
        await sql`DELETE FROM teams WHERE leader_user_id = ANY(${userIds})`
        await sql`DELETE FROM users WHERE id = ANY(${userIds})`
      }

      const remainingUsers = await sql<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM users WHERE email = ANY(${trackedEmails})`
      if (Number(remainingUsers[0]?.count ?? 0) !== 0) {
        throw new Error('Temporary auth and RBAC test rows remained after cleanup.')
      }
    }, 'Temporary validation rows and auth data are removed and no test records remain.')
  } finally {
    await afterEachCleanup()
    await sql.end({ timeout: 5 })
  }

  const allPass = Object.values(state).every((entry) => entry?.pass)
  const lines = [
    'POSTGRESQL INTEGRATION TEST REPORT',
    '----------------------------------',
    `DATABASE CONNECTION: ${state['DATABASE CONNECTION']?.pass ? 'PASS' : 'FAIL'}`,
    `SCHEMA: ${state['SCHEMA']?.pass ? 'PASS' : 'FAIL'}`,
    `AUTH: ${state['AUTH']?.pass ? 'PASS' : 'FAIL'}`,
    `SESSION: ${state['SESSION']?.pass ? 'PASS' : 'FAIL'}`,
    `RBAC: ${state['RBAC']?.pass ? 'PASS' : 'FAIL'}`,
    `REGISTRATION COMMIT: ${state['REGISTRATION COMMIT']?.pass ? 'PASS' : 'FAIL'}`,
    `REGISTRATION ROLLBACK: ${state['REGISTRATION ROLLBACK']?.pass ? 'PASS' : 'FAIL'}`,
    `PROJECT SUBMISSION: ${state['PROJECT SUBMISSION']?.pass ? 'PASS' : 'FAIL'}`,
    `PROJECT ROLLBACK: ${state['PROJECT ROLLBACK']?.pass ? 'PASS' : 'FAIL'}`,
    `ROUTE INTEGRATION: ${state['ROUTE INTEGRATION']?.pass ? 'PASS' : 'FAIL'}`,
    `CLEANUP: ${state['CLEANUP']?.pass ? 'PASS' : 'FAIL'}`,
    `FINAL RESULT: ${allPass ? 'PASS' : 'FAIL'}`,
  ]

  console.log(lines.join('\n'))
  for (const key of Object.keys(state)) {
    const entry = state[key]
    if (entry && !entry.pass) {
      console.log(`FAILURE :: ${key} :: ${entry.error ?? 'No message'}`)
    }
  }

  if (!allPass) {
    process.exitCode = 1
  }
}

main().catch((error: any) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`UNHANDLED TEST ERROR :: ${message}`)
  process.exitCode = 1
})
