import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { getSettings, fmt } from '../lib/settings'
import { nextRegistrationId, newQrToken } from '../lib/ids'
import { hashPassword } from '../lib/auth'
import { logAudit } from '../lib/audit'
import { isEmail, sanitizeText } from '../lib/validation'
import type { PostgresDatabase } from '../lib/db'

const registerRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

registerRoutes.get('/register', async (c) => {
  const s = await getSettings(c.get('db'))
  const categories = await c.get('db').many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order')

  if (!s.registration_open) {
    return c.render(
      <SiteLayout title="Registration Closed">
        <section class="section"><div class="container-narrow empty-state"><div class="icon">&#128274;</div><h3>Registration is currently closed</h3><p>The organizing team has closed new registrations. Check announcements for updates.</p><a href="/" class="btn btn-dark" style="margin-top:14px;">Back to Home</a></div></section>
      </SiteLayout>
    )
  }

  const error = c.req.query('error')

  return c.render(
    <SiteLayout title="Register Your Team">
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / Register</div>
          <div class="section-head">
            <div class="kicker">Team Registration</div>
            <h2>Bring your team.</h2>
            <p>Registration closes on {fmt(s.registration_deadline, 'the published deadline')}. Teams must have {s.team_size_min}–{s.team_size_max} members. Have your college, team, and project details ready.</p>
          </div>

          {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}

          <form class="form-card" method="post" action="/register">
            <h3>Register Your Team</h3>
            <div class="field"><label>College Name *</label><input name="college_name" required maxLength={200} /></div>
            <div class="field"><label>Department *</label><input name="department" required maxLength={120} /></div>
            <div class="field"><label>Team Leader Name *</label><input name="leader_name" required maxLength={120} /></div>
            <div class="field"><label>Leader Email *</label><input type="email" name="leader_email" required maxLength={160} /></div>
            <div class="field"><label>Student portal password *</label><input type="password" name="password" required minLength={8} /></div>
            {[2, 3, 4].map((member) => <div class="field"><label>Team Member {member} Name</label><input name={`member_name_${member}`} maxLength={120} /></div>)}
            <div class="field"><label>Project Title *</label><input name="project_title" required maxLength={160} /></div>
            <label class="checkbox-row"><input type="checkbox" name="consent" required /> <span>I confirm these registration details are accurate.</span></label>
            <button type="submit" class="btn btn-primary btn-block">Register Team</button>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
})

registerRoutes.post('/register', async (c) => {
  const s = await getSettings(c.get('db'))
  if (!s.registration_open) return c.redirect('/register?error=' + encodeURIComponent('Registration is currently closed.'))
  try {
    const body = await c.req.parseBody({ all: true })

    const collegeName = sanitizeText(body.college_name as string, 200)
    const department = sanitizeText(body.department as string, 120)
    const teamName = sanitizeText(body.team_name as string, 120) || `${sanitizeText(body.leader_name as string, 120)} Team`
    const leaderName = sanitizeText(body.leader_name as string, 120)
    const leaderEmail = sanitizeText(body.leader_email as string, 160).toLowerCase()
    const password = (body.password as string) || ''
    const projectTitle = sanitizeText(body.project_title as string, 160)
    const consent = body.consent === 'on' || body.consent === 'true'

    if (!collegeName || !department) throw new Error('Please complete the college and department fields.')
    if (!teamName || !leaderName || !isEmail(leaderEmail)) throw new Error('Please complete the team leader fields correctly.')
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.')
    if (!projectTitle) throw new Error('Project title is required.')
    if (!consent) throw new Error('You must confirm the accuracy of your information to proceed.')

    const memberNames = [2, 3, 4].map((member) => sanitizeText(body[`member_name_${member}`] as string, 120)).filter(Boolean)

    const totalTeamSize = memberNames.length + 1
    if (totalTeamSize > s.team_size_max) throw new Error(`A team can have at most ${s.team_size_max} members.`)

    // check for duplicate leader email as existing user
    const existingUser = await c.get('db').one<{ id: number }>('SELECT id FROM users WHERE email = ?', [leaderEmail])
    if (existingUser) throw new Error('An account with this leader email already exists. Please use a different email or log in to manage your existing team.')

    const passwordHash = await hashPassword(password)
    const { registrationId, teamId } = await c.get('db').transaction(async (db) => {
      const college = await ensureCollege(db, collegeName)
      const registrationId = await nextRegistrationId(db, new Date().getFullYear())
      const qrToken = newQrToken()
      const user = await db.one<{ id: number }>(
        'INSERT INTO users (email, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [leaderEmail, passwordHash, leaderName, 'student', null]
      )
      const team = await db.one<{ id: number }>(
        `INSERT INTO teams (registration_id, team_name, college_id, department, leader_user_id, leader_name, leader_email, leader_usn, leader_phone, status, qr_token, consent_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?, 1) RETURNING id`,
        [registrationId, teamName, college.id, department, user!.id, leaderName, leaderEmail, null, null, qrToken]
      )
      const teamId = team!.id
      await db.execute('INSERT INTO team_members (team_id, user_id, full_name, email, department, is_leader, invitation_status) VALUES (?,?,?,?,?,1,\'accepted\')', [teamId, user!.id, leaderName, leaderEmail, department])
      for (const memberName of memberNames) {
        await db.execute('INSERT INTO team_members (team_id, full_name, is_leader, invitation_status) VALUES (?, ?, 0, \'accepted\')', [teamId, memberName])
      }
      const project = await db.one<{ id: number }>(
        `INSERT INTO projects (team_id, category_id, title, problem_statement, solution_description, technologies, expected_outcome, status)
         VALUES (?,NULL,?,'To be provided.','To be provided.','To be provided.',NULL,'draft') RETURNING id`,
        [teamId, projectTitle]
      )
      return { registrationId, teamId }
    })
    await logAudit(c.get('db'), null, 'registration_submitted', 'team', teamId, `Registration ${registrationId} submitted by ${leaderEmail}`)

    return c.redirect(`/registration/success?id=${encodeURIComponent(registrationId)}`)
  } catch (err: any) {
    return c.redirect('/register?error=' + encodeURIComponent(err?.message || 'Something went wrong. Please check your details and try again.'))
  }
})

async function ensureCollege(db: PostgresDatabase, name: string) {
  const existing = await db.one<{ id: number }>('SELECT id FROM colleges WHERE name = ? LIMIT 1', [name])
  if (existing) return existing
  const created = await db.one<{ id: number }>('INSERT INTO colleges (name) VALUES (?) RETURNING id', [name])
  return { id: created!.id }
}

registerRoutes.get('/registration/success', async (c) => {
  const regId = c.req.query('id') || ''
  const team = await c.get('db').one<any>('SELECT * FROM teams WHERE registration_id = ?', [regId])
  if (!team) return c.redirect('/register')

  return c.render(
    <SiteLayout title="Registration Successful">
      <section class="section">
        <div class="container-narrow" style="text-align:center;">
          <div class="icon-badge blue" style="margin:0 auto 18px; width:60px; height:60px; font-size:28px;">&#9989;</div>
          <h1>You're registered!</h1>
          <p style="color:var(--ink-700); font-size:16px;">Your team <strong>{team.team_name}</strong> has been submitted for review. Save your registration ID — you'll need it to log in and track your status.</p>
          <div style="margin:30px 0;">
            <div class="badge badge-info" style="font-size:16px; padding:10px 18px;">{team.registration_id}</div>
          </div>
          <div class="hero-actions" style="justify-content:center;">
            <a href={`/registration/pass?id=${team.registration_id}`} class="btn btn-primary">View Your Registration Pass</a>
            <a href="/student/login" class="btn btn-ghost">Go to Student Login</a>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
})

export default registerRoutes
