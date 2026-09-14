import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { AppShell } from '../components/app-shell'
import { RegistrationPass } from '../components/pass'
import { hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, getSessionCookieValue } from '../lib/auth'
import { getTeamForUser, statusBadgeClass, fmtStatusLabel } from '../lib/db-helpers'
import { requireRole } from '../lib/guards'
import { getSettings } from '../lib/settings'
import { sanitizeText, isEmail, ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, validateUploadedFile } from '../lib/validation'
import { logAudit } from '../lib/audit'
import { createPendingStoragePath, getStorage } from '../lib/storage'
import { confirmUploadManifest, parseUploadManifest, type UploadType } from '../lib/upload-manifest'

const studentRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

// ---------------------------------------------------------------- Login
studentRoutes.get('/student/login', async (c) => {
  const error = c.req.query('error')
  const next = c.req.query('next') || '/student/dashboard'
  return c.render(
    <SiteLayout title="Student Login">
      <section class="section">
        <div class="container-narrow" style="max-width:440px;">
          <div class="section-head" style="text-align:center; margin:0 auto 26px;">
            <div class="kicker">Student Portal</div>
            <h2>Log in to your team</h2>
            <p>Use the leader email and password you set during registration.</p>
          </div>
          {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
          <form method="post" action="/student/login" class="form-card">
            <input type="hidden" name="next" value={next} />
            <div class="field"><label>Email</label><input type="email" name="email" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" required /></div>
            <button type="submit" class="btn btn-primary btn-block">Log In</button>
            <p style="text-align:center; margin:16px 0 0; font-size:13.5px; color:var(--ink-500);">Haven't registered yet? <a href="/register" style="color:var(--blue-600); font-weight:600;">Register your team</a></p>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
})

studentRoutes.post('/student/login', async (c) => {
  const body = await c.req.parseBody()
  const email = sanitizeText(body.email as string, 160).toLowerCase()
  const password = (body.password as string) || ''
  const next = (body.next as string) || '/student/dashboard'

  const user = await c.get('db').one<any>(`SELECT * FROM users WHERE email = ? AND role = 'student'`, [email])
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.redirect('/student/login?error=' + encodeURIComponent('Incorrect email or password.'))
  }
  if (!user.is_active) return c.redirect('/student/login?error=' + encodeURIComponent('This account has been deactivated.'))

  const sid = await createSession(c.get('db'), user.id)
  setSessionCookie(c, sid)
  return c.redirect(next)
})

studentRoutes.get('/student/logout', async (c) => {
  const sid = getSessionCookieValue(c)
  if (sid) await destroySession(c.get('db'), sid)
  clearSessionCookie(c)
  return c.redirect('/student/login')
})

studentRoutes.use('/student/dashboard', requireRole('student'))
studentRoutes.use('/student/team', requireRole('student'))
studentRoutes.use('/student/project', requireRole('student'))
studentRoutes.use('/student/announcements', requireRole('student'))
studentRoutes.use('/student/schedule', requireRole('student'))
studentRoutes.use('/student/pass', requireRole('student'))
studentRoutes.use('/student/certificate', requireRole('student'))

// ---------------------------------------------------------------- Dashboard
studentRoutes.get('/student/dashboard', async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team) return c.redirect('/register?error=' + encodeURIComponent('No team found for your account.'))

  const project = await c.get('db').one<any>('SELECT * FROM projects WHERE team_id = ?', [team.id])
  const evaluation = project ? await c.get('db').one<any>(`SELECT AVG(total_score) as avg_score, COUNT(*) as n FROM evaluations WHERE project_id = ? AND status = 'completed'`, [project.id]) : null
  const s = await getSettings(c.get('db'))
  const cert = await c.get('db').one<any>('SELECT * FROM certificates WHERE team_id = ? AND member_id = (SELECT id FROM team_members WHERE user_id = ? LIMIT 1)', [team.id, user.id])

  const steps = [
    { label: 'Registration Submitted', done: true },
    { label: 'Registration Complete', done: team.status === 'registered' || team.status === 'approved', current: false },
    { label: 'Project Submitted', done: project?.status === 'submitted' || project?.status === 'reviewed', current: (team.status === 'registered' || team.status === 'approved') && project?.status !== 'submitted' },
    { label: 'Event Check-in', done: !!team.checked_in },
    { label: 'Evaluation', done: (evaluation?.n || 0) > 0 },
    { label: 'Results', done: !!s.results_published },
    { label: 'Certificate', done: !!cert },
  ]
  let currentSet = false
  for (const st of steps) { if (!st.done && !currentSet) { st.current = true; currentSet = true } }

  return c.render(
    <AppShell title="Dashboard" role="student" userName={user.full_name} activePath="/student/dashboard" subtitle={`Welcome back, ${team.leader_name === user.full_name ? 'Team Leader' : user.full_name}`}>
      <div style="margin-bottom:6px; font-size:15px; color:var(--ink-500);">Team</div>
      <h2 style="margin-bottom:20px;">{team.team_name}</h2>

      <div class="grid-3" style="margin-bottom:30px;">
        <div class="dashboard-card">
          <h3>Registration</h3>
          <div class="meta">ID: {team.registration_id}</div>
          <span class={`badge ${statusBadgeClass(team.status)}`}>{fmtStatusLabel(team.status)}</span>
          {team.status === 'rejected' && team.rejection_reason && <p style="margin-top:10px; font-size:13px; color:var(--danger);">{team.rejection_reason}</p>}
        </div>
        <div class="dashboard-card">
          <h3>Project</h3>
          <div class="meta">{project ? project.title : 'Not started'}</div>
          <span class={`badge ${statusBadgeClass(project?.status || 'not_started')}`}>{fmtStatusLabel(project?.status || 'not_started')}</span>
        </div>
        <div class="dashboard-card">
          <h3>Check-in</h3>
          <div class="meta">{team.checked_in ? `Checked in at ${new Date(team.checked_in_at).toLocaleTimeString()}` : 'Not checked in yet'}</div>
          <span class={`badge ${team.checked_in ? 'badge-success' : 'badge-neutral'}`}>{team.checked_in ? 'Checked In' : 'Not Checked In'}</span>
        </div>
        <div class="dashboard-card">
          <h3>Evaluation</h3>
          <div class="meta">{evaluation?.n ? `${evaluation.n} evaluation(s) completed` : 'Pending'}</div>
          <span class={`badge ${evaluation?.n ? 'badge-success' : 'badge-warn'}`}>{evaluation?.n ? 'Evaluated' : 'Pending'}</span>
        </div>
        <div class="dashboard-card">
          <h3>Results</h3>
          <div class="meta">{s.results_published ? (evaluation?.avg_score ? `Score: ${Number(evaluation.avg_score).toFixed(1)}/100` : 'Published') : 'Not published yet'}</div>
          <span class={`badge ${s.results_published ? 'badge-success' : 'badge-neutral'}`}>{s.results_published ? 'Published' : 'Pending'}</span>
        </div>
        <div class="dashboard-card">
          <h3>Certificate</h3>
          <div class="meta">{cert ? 'Available for download' : 'Not available yet'}</div>
          {cert ? <a href="/student/certificate" class="btn btn-sm btn-primary">Download</a> : <span class="badge badge-neutral">Not Available</span>}
        </div>
      </div>

      <div class="dashboard-card">
        <h3>Your Journey</h3>
        <div class="meta">Track where your team is in the Mini Anveshana process.</div>
        <div class="timeline" style="margin-top:10px;">
          {steps.map((st: any) => (
            <div class={`timeline-item ${st.done ? 'complete' : st.current ? 'current' : ''}`}>
              <h4>{st.label}</h4>
            </div>
          ))}
        </div>
      </div>

      <div style="margin-top:24px;">
        <a href="/student/pass" class="btn btn-dark">View Registration Pass &amp; QR</a>
      </div>
    </AppShell>
  )
})

// ---------------------------------------------------------------- Pass
studentRoutes.get('/student/pass', async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team) return c.redirect('/student/dashboard')
  const fullTeam = await c.get('db').one<any>(`SELECT t.*, col.name as college_name FROM teams t JOIN colleges col ON col.id = t.college_id WHERE t.id = ?`, [team.id])
  const project = await c.get('db').one<any>(`SELECT cat.name as category_name FROM projects p LEFT JOIN categories cat ON cat.id = p.category_id WHERE p.team_id = ?`, [team.id])
  const baseUrl = new URL(c.req.url).origin
  return c.render(
    <AppShell title="Registration Pass" role="student" userName={user.full_name} activePath="/student/dashboard">
      <RegistrationPass team={fullTeam} categoryName={project?.category_name} verifyBaseUrl={baseUrl} />
    </AppShell>
  )
})

// ---------------------------------------------------------------- Certificate
studentRoutes.get('/student/certificate', async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team) return c.redirect('/student/dashboard')
  const cert = await c.get('db').one<any>('SELECT * FROM certificates WHERE team_id = ? AND member_id = (SELECT id FROM team_members WHERE user_id = ? LIMIT 1) AND is_available = 1', [team.id, user.id])
  if (!cert) {
    return c.render(
      <AppShell title="Certificate" role="student" userName={user.full_name} activePath="/student/dashboard">
        <div class="empty-state"><div class="icon">&#127891;</div><h3>Certificate not available yet</h3><p>The organizing team will enable certificates after the event concludes.</p></div>
      </AppShell>
    )
  }
  const fullCert = await c.get('db').one<any>(`SELECT cert.*, t.team_name, t.registration_id, col.name as college_name FROM certificates cert JOIN teams t ON t.id = cert.team_id JOIN colleges col ON col.id = t.college_id WHERE cert.id = ?`, [cert.id])
  const { CertificateView } = await import('../components/certificate')
  const baseUrl = new URL(c.req.url).origin
  return c.render(
    <AppShell title="Certificate" role="student" userName={user.full_name} activePath="/student/dashboard" topbarActions={<button onclick="window.print()" class="btn btn-dark btn-sm">Print / Save PDF</button>}>
      <CertificateView cert={fullCert} baseUrl={baseUrl} />
    </AppShell>
  )
})

// ---------------------------------------------------------------- Team management
studentRoutes.get('/student/team', async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team) return c.redirect('/student/dashboard')
  const isLeader = team.leader_user_id === user.id
  const members = await c.get('db').many<any>('SELECT * FROM team_members WHERE team_id = ? ORDER BY is_leader DESC, id', [team.id])
  const mentor = await c.get('db').one<any>('SELECT * FROM faculty_coordinators WHERE team_id = ?', [team.id])
  const error = c.req.query('error')
  const success = c.req.query('success')
  const s = await getSettings(c.get('db'))

  return c.render(
    <AppShell title="My Team" role="student" userName={user.full_name} activePath="/student/team">
      {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      <div class="grid-2" style="align-items:flex-start;">
        <div class="dashboard-card">
          <h3>{team.team_name}</h3>
          <div class="meta">{team.registration_id} · {team.college_name}</div>
          <span class={`badge ${statusBadgeClass(team.status)}`}>{fmtStatusLabel(team.status)}</span>

          <h4 style="margin-top:20px; font-size:14px;">Members ({members.length}/{s.team_size_max})</h4>
          {members.map((m) => (
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line);">
              <div>
                <div style="font-weight:600; font-size:14px;">{m.full_name} {m.is_leader ? <span class="badge badge-info" style="margin-left:6px;">Leader</span> : ''}</div>
                <div style="font-size:12.5px; color:var(--ink-500);">{m.email} · {m.department} · {m.year}</div>
              </div>
              {isLeader && !m.is_leader && (
                <form method="post" action="/student/team/remove-member" onsubmit="return confirm('Remove this member from the team?')">
                  <input type="hidden" name="member_id" value={m.id} />
                  <button class="btn btn-danger btn-sm" type="submit">Remove</button>
                </form>
              )}
            </div>
          ))}

          {isLeader && members.length < s.team_size_max && (
            <form method="post" action="/student/team/add-member" style="margin-top:18px; border-top:1px dashed var(--line); padding-top:16px;">
              <h4 style="font-size:14px; margin-bottom:10px;">Add Member</h4>
              <div class="form-row-2">
                <div class="field" style="margin-bottom:10px;"><input name="full_name" placeholder="Full name" required /></div>
                <div class="field" style="margin-bottom:10px;"><input type="email" name="email" placeholder="Email" required /></div>
              </div>
              <div class="form-row-2">
                <div class="field" style="margin-bottom:10px;"><input name="usn" placeholder="USN / Student ID" required /></div>
                <div class="field" style="margin-bottom:10px;"><input name="department" placeholder="Department" required /></div>
              </div>
              <div class="field" style="margin-bottom:10px; max-width:160px;">
                <select name="year" required><option value="">Year</option><option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option></select>
              </div>
              <button type="submit" class="btn btn-primary btn-sm">Add Member</button>
            </form>
          )}
          {!isLeader && <p class="hint" style="margin-top:14px;">Only the team leader can add or remove members.</p>}
        </div>

        <div>
          <div class="dashboard-card" style="margin-bottom:20px;">
            <h3>Faculty Mentor</h3>
            {mentor ? (
              <div>
                <p style="margin:0 0 4px; font-weight:600;">{mentor.name}</p>
                <p style="margin:0; font-size:13.5px; color:var(--ink-500);">{mentor.department}<br />{mentor.email} · {mentor.phone}</p>
              </div>
            ) : <p class="hint">No mentor on file.</p>}
          </div>
          <div class="dashboard-card">
            <h3>Team Leader</h3>
            <p style="margin:0 0 4px; font-weight:600;">{team.leader_name}</p>
            <p style="margin:0; font-size:13.5px; color:var(--ink-500);">{team.leader_email}<br />{team.leader_phone} · {team.leader_usn}</p>
          </div>
        </div>
      </div>
    </AppShell>
  )
})

studentRoutes.post('/student/team/add-member', requireRole('student'), async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team || team.leader_user_id !== user.id) return c.redirect('/student/team?error=' + encodeURIComponent('Only the team leader can add members.'))

  const s = await getSettings(c.get('db'))
  const memberCount = await c.get('db').one<{ n: number }>('SELECT COUNT(*) as n FROM team_members WHERE team_id = ?', [team.id])
  if ((memberCount?.n || 0) >= s.team_size_max) return c.redirect('/student/team?error=' + encodeURIComponent(`Team already has the maximum of ${s.team_size_max} members.`))

  const body = await c.req.parseBody()
  const fullName = sanitizeText(body.full_name as string, 120)
  const email = sanitizeText(body.email as string, 160).toLowerCase()
  const usn = sanitizeText(body.usn as string, 40)
  const department = sanitizeText(body.department as string, 120)
  const year = sanitizeText(body.year as string, 20)
  if (!fullName || !isEmail(email) || !usn || !department || !year) {
    return c.redirect('/student/team?error=' + encodeURIComponent('Please fill all member fields correctly.'))
  }

  await c.get('db').transaction(async (db) => {
    await db.execute('INSERT INTO team_members (team_id, full_name, email, usn, department, year, is_leader, invitation_status) VALUES (?,?,?,?,?,?,0,\'accepted\')', [team.id, fullName, email, usn, department, year])
    await logAudit(db, user.id, 'team_member_added', 'team', team.id, `Added member ${email}`)
  })
  return c.redirect('/student/team?success=' + encodeURIComponent('Member added successfully.'))
})

studentRoutes.post('/student/team/remove-member', requireRole('student'), async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team || team.leader_user_id !== user.id) return c.redirect('/student/team?error=' + encodeURIComponent('Only the team leader can remove members.'))

  const body = await c.req.parseBody()
  const memberId = parseInt(body.member_id as string, 10)
  const member = await c.get('db').one<any>('SELECT * FROM team_members WHERE id = ? AND team_id = ?', [memberId, team.id])
  if (!member) return c.redirect('/student/team?error=' + encodeURIComponent('Member not found.'))
  if (member.is_leader) return c.redirect('/student/team?error=' + encodeURIComponent('You cannot remove the team leader.'))

  await c.get('db').transaction(async (db) => {
    await db.execute('DELETE FROM team_members WHERE id = ?', [memberId])
    await logAudit(db, user.id, 'team_member_removed', 'team', team.id, `Removed member ${member.email}`)
  })
  return c.redirect('/student/team?success=' + encodeURIComponent('Member removed.'))
})

// ---------------------------------------------------------------- Project submission
studentRoutes.get('/student/project', async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team) return c.redirect('/student/dashboard')
  const project = await c.get('db').one<any>('SELECT * FROM projects WHERE team_id = ?', [team.id])
  const categories = await c.get('db').many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order')
  const files = project ? await c.get('db').many<any>('SELECT * FROM project_files WHERE project_id = ?', [project.id]) : []
  const s = await getSettings(c.get('db'))
  const error = c.req.query('error')
  const success = c.req.query('success')
  const deadlinePassed = s.project_deadline ? new Date() > new Date(s.project_deadline) : false
  const canEdit = (team.status === 'registered' || team.status === 'approved') && (!deadlinePassed || s.late_submission_allowed) && project?.status !== 'reviewed'

  return c.render(
    <AppShell title="Project" role="student" userName={user.full_name} activePath="/student/project">
      {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      {team.status !== 'registered' && team.status !== 'approved' && (
        <div class="alert alert-warn">Your team is not currently eligible to edit project details.</div>
      )}
      {deadlinePassed && !s.late_submission_allowed && (
        <div class="alert alert-warn">The project submission deadline ({s.project_deadline}) has passed. Late submissions are currently not enabled.</div>
      )}
      {project?.status === 'reviewed' && (
        <div class="alert alert-info">Your project has already been reviewed by evaluators and can no longer be edited.</div>
      )}

      <div class="form-card">
          <form id="student-project-form" method="post" action="/student/project" enctype="multipart/form-data" data-upload-url="/student/project/file-upload-url">
          <div class="field"><label>Project Title *</label><input name="title" required value={project?.title || ''} disabled={!canEdit} /></div>
          <div class="field"><label>Category *</label>
            <select name="category_id" required disabled={!canEdit}>
              <option value="">Select a category</option>
              {categories.map((cat) => <option value={cat.id} selected={cat.id === project?.category_id}>{cat.name}</option>)}
            </select>
          </div>
          <div class="field"><label>Problem Statement *</label><textarea name="problem_statement" required disabled={!canEdit}>{project?.problem_statement || ''}</textarea></div>
          <div class="field"><label>Solution Description *</label><textarea name="solution_description" required disabled={!canEdit}>{project?.solution_description || ''}</textarea></div>
          <div class="field"><label>Key Features</label><textarea name="features" disabled={!canEdit} placeholder="One per line">{project?.features || ''}</textarea></div>
          <div class="field"><label>Technologies (comma separated) *</label><input name="technologies" required disabled={!canEdit} value={project?.technologies || ''} /></div>
          <div class="field"><label>Architecture / How it works</label><textarea name="architecture" disabled={!canEdit}>{project?.architecture || ''}</textarea></div>
          <div class="field"><label>Expected Outcome</label><textarea name="expected_outcome" disabled={!canEdit}>{project?.expected_outcome || ''}</textarea></div>
          <div class="field"><label>Future Scope</label><textarea name="future_scope" disabled={!canEdit}>{project?.future_scope || ''}</textarea></div>
          <div class="form-row-2">
            <div class="field"><label>Demo Video URL</label><input type="url" name="demo_video_url" disabled={!canEdit} value={project?.demo_video_url || ''} placeholder="https://..." /></div>
            <div class="field"><label>GitHub URL</label><input type="url" name="github_url" disabled={!canEdit} value={project?.github_url || ''} placeholder="https://github.com/..." /></div>
          </div>

          <h4 style="margin-top:10px;">Files</h4>
          {files.length > 0 ? (
            <ul style="padding-left:18px; font-size:14px; color:var(--ink-700); margin-bottom:14px;">
              {files.map((f) => <li>{f.file_type}: {f.file_name}</li>)}
            </ul>
          ) : <p class="hint">No files uploaded yet.</p>}
          {canEdit && (
            <div>
              <div class="field"><label>Upload Abstract (PDF/DOC)</label><input type="file" name="abstract" accept=".pdf,.doc,.docx" /></div>
              <div class="field"><label>Upload Presentation (PPT/PDF)</label><input type="file" name="presentation" accept=".pdf,.ppt,.pptx" /></div>
              <div class="field"><label>Upload Images</label><input type="file" name="images" accept=".png,.jpg,.jpeg,.webp" multiple /></div>
            </div>
          )}

          {canEdit && <button type="submit" class="btn btn-primary">Save &amp; Submit Project</button>}
        </form>
      </div>
      <script src="/static/student-project.js"></script>
    </AppShell>
  )
})

studentRoutes.post('/student/project/file-upload-url', requireRole('student'), async (c) => {
  try {
    const user = c.get('user' as never) as any
    const team = await getTeamForUser(c.get('db'), user.id)
    if (!team || !['registered', 'approved'].includes(team.status)) return c.json({ error: 'Your team is not authorized to upload project files.' }, 403)
    const body = await c.req.json<{ type?: UploadType; name?: string; contentType?: string; size?: number }>()
    if (!body.type || !body.name || !body.contentType || typeof body.size !== 'number' || !Number.isInteger(body.size)) return c.json({ error: 'Invalid file metadata.' }, 400)
    const allowed = body.type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_DOC_TYPES
    const validationError = validateUploadedFile({ name: body.name, type: body.contentType, size: body.size }, allowed)
    if (validationError) return c.json({ error: validationError }, 400)
    const path = createPendingStoragePath(`project-${team.id}`, body.type, body.name)
    const signedUrl = await getStorage(c.env).createSignedUploadUrl(path)
    return c.json({ path, signedUrl })
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not initialize file upload.' }, 500)
  }
})

studentRoutes.post('/student/project', requireRole('student'), async (c) => {
  const user = c.get('user' as never) as any
  const team = await getTeamForUser(c.get('db'), user.id)
  if (!team) return c.redirect('/student/dashboard')
  if (!['registered', 'approved'].includes(team.status)) return c.redirect('/student/project?error=' + encodeURIComponent('Your team is not currently eligible to submit a project.'))

  const s = await getSettings(c.get('db'))
  const deadlinePassed = s.project_deadline ? new Date() > new Date(s.project_deadline) : false
  if (deadlinePassed && !s.late_submission_allowed) {
    return c.redirect('/student/project?error=' + encodeURIComponent('The project submission deadline has passed.'))
  }

  const uploadedFiles: Array<{ type: string; name: string; key: string; contentType: string | null; size: number }> = []
  try {
    const body = await c.req.parseBody({ all: true })
    const title = sanitizeText(body.title as string, 160)
    const categoryId = parseInt(body.category_id as string, 10)
    const problemStatement = sanitizeText(body.problem_statement as string, 3000)
    const solutionDescription = sanitizeText(body.solution_description as string, 3000)
    const features = sanitizeText(body.features as string, 3000)
    const technologies = sanitizeText(body.technologies as string, 300)
    const architecture = sanitizeText(body.architecture as string, 3000)
    const expectedOutcome = sanitizeText(body.expected_outcome as string, 1500)
    const futureScope = sanitizeText(body.future_scope as string, 1500)
    const demoVideoUrl = sanitizeText(body.demo_video_url as string, 300)
    const githubUrl = sanitizeText(body.github_url as string, 300)

    if (!title || !categoryId || !problemStatement || !solutionDescription || !technologies) {
      throw new Error('Please complete all required fields.')
    }

    const project = await c.get('db').transaction(async (db) => {
      const existing = await db.one<any>('SELECT * FROM projects WHERE team_id = ?', [team.id])
      const projectId = existing
        ? existing.id
        : (await db.one<{ id: number }>('INSERT INTO projects (team_id, category_id, title, status) VALUES (?,?,?,\'draft\') RETURNING id', [team.id, categoryId, title]))!.id
      await db.execute(
        `UPDATE projects SET category_id=?, title=?, problem_statement=?, solution_description=?, features=?, technologies=?, architecture=?, expected_outcome=?, future_scope=?, demo_video_url=?, github_url=?, status='submitted', submitted_at=now(), updated_at=now() WHERE id = ?`,
        [categoryId, title, problemStatement, solutionDescription, features, technologies, architecture, expectedOutcome, futureScope, demoVideoUrl, githubUrl, projectId]
      )
      return { id: projectId }
    })

    const manifest = parseUploadManifest(body.storage_files)
    const confirmed = await confirmUploadManifest(getStorage(c.env), manifest, `pending/project-${team.id}/`)
    for (const file of confirmed) uploadedFiles.push({ type: file.type, name: file.name, key: file.path, contentType: file.contentType, size: file.size })

    await c.get('db').transaction(async (db) => {
      for (const file of uploadedFiles) {
        await db.execute('INSERT INTO project_files (project_id, file_type, file_name, r2_key, content_type, size_bytes) VALUES (?,?,?,?,?,?)', [project.id, file.type, file.name, file.key, file.contentType, file.size])
      }
      await logAudit(db, user.id, 'project_submitted', 'project', project.id, `Project "${title}" submitted`)
    })
    return c.redirect('/student/project?success=' + encodeURIComponent('Project saved and submitted successfully.'))
  } catch (err: any) {
    const keys = uploadedFiles.map((file) => file.key)
    if (keys.length > 0) await getStorage(c.env).remove(keys).catch(() => undefined)
    return c.redirect('/student/project?error=' + encodeURIComponent(err?.message || 'Something went wrong.'))
  }
})

// ---------------------------------------------------------------- Announcements
studentRoutes.get('/student/announcements', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>(`SELECT * FROM announcements WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY published_at DESC`)
  return c.render(
    <AppShell title="Announcements" role="student" userName={user.full_name} activePath="/student/announcements">
      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128276;</div><h3>No announcements right now</h3><p>Check back later for updates from the organizing team.</p></div>
      ) : (
        rows.map((a) => (
          <div class="dashboard-card" style="margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <h3>{a.title}</h3>
              <span class={`badge ${a.priority === 'urgent' ? 'badge-danger' : a.priority === 'important' ? 'badge-warn' : 'badge-neutral'}`}>{a.priority}</span>
            </div>
            <p style="margin:0 0 8px;">{a.message}</p>
            <div class="meta">{new Date(a.published_at).toLocaleString()}</div>
          </div>
        ))
      )}
    </AppShell>
  )
})

// ---------------------------------------------------------------- Schedule
studentRoutes.get('/student/schedule', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>('SELECT * FROM event_schedule ORDER BY sort_order, id')
  return c.render(
    <AppShell title="Schedule" role="student" userName={user.full_name} activePath="/student/schedule">
      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128197;</div><h3>Schedule not published yet</h3></div>
      ) : (
        <div class="dashboard-card">
          <div class="timeline">
            {rows.map((item) => (
              <div class="timeline-item">
                <h4>{item.event_time} — {item.title} {item.stage && <span class="tag" style="margin-left:6px;">{item.stage}</span>}</h4>
                <p>{item.description}</p>
                {item.location && <p style="font-size:12.5px; margin-top:2px;">&#128205; {item.location}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
})

export default studentRoutes
