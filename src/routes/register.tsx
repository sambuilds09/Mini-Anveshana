import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { getSettings, fmt } from '../lib/settings'
import { nextRegistrationId, newQrToken } from '../lib/ids'
import { hashPassword } from '../lib/auth'
import { logAudit } from '../lib/audit'
import { isEmail, sanitizeText, ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, validateUploadedFile } from '../lib/validation'
import type { PostgresDatabase } from '../lib/db'
import { createPendingStoragePath, getStorage } from '../lib/storage'
import { confirmUploadManifest, parseUploadManifest, type UploadType } from '../lib/upload-manifest'

const registerRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

registerRoutes.post('/register/file-upload-url', async (c) => {
  try {
    const body = await c.req.json<{ type?: UploadType; name?: string; contentType?: string; size?: number }>()
    if (!body.type || !body.name || !body.contentType || typeof body.size !== 'number' || !Number.isInteger(body.size)) return c.json({ error: 'Invalid file metadata.' }, 400)
    const allowed = body.type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_DOC_TYPES
    const validationError = validateUploadedFile({ name: body.name, type: body.contentType, size: body.size }, allowed)
    if (validationError) return c.json({ error: validationError }, 400)
    const path = createPendingStoragePath('registrations', body.type, body.name)
    const signedUrl = await getStorage(c.env).createSignedUploadUrl(path)
    return c.json({ path, signedUrl })
  } catch (error: any) {
    return c.json({ error: error?.message || 'Could not initialize file upload.' }, 500)
  }
})

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

          <div class="step-track" role="tablist" aria-label="Registration steps">
            {['College', 'Team', 'Members', 'Project', 'Mentor', 'Documents', 'Review'].map((label, i) => (
              <div class={`step-pill ${i === 0 ? 'active' : ''}`} data-step-pill={i}><span class="num">{i + 1}</span>{label}</div>
            ))}
          </div>

          <form id="reg-form" class="form-card" method="post" action="/register" enctype="multipart/form-data" data-min-members={s.team_size_min} data-max-members={s.team_size_max}>
            {/* STEP 1: College */}
            <div class="wizard-step">
              <h3>College Information</h3>
              <div class="form-row-2">
                <div class="field"><label>College Name *</label><input name="college_name" required maxLength={200} /></div>
                <div class="field"><label>University *</label><input name="university" required maxLength={200} /></div>
              </div>
              <div class="form-row-2">
                <div class="field"><label>Department *</label><input name="department" required maxLength={120} /></div>
                <div class="field"><label>City *</label><input name="city" required maxLength={120} /></div>
              </div>
              <div class="field"><label>State *</label><input name="state" required maxLength={120} /></div>
              <div style="display:flex; justify-content:flex-end;"><button type="button" class="btn btn-primary" data-next>Continue &rarr;</button></div>
            </div>

            {/* STEP 2: Team */}
            <div class="wizard-step" style="display:none;">
              <h3>Team Information</h3>
              <div class="field"><label>Team Name *</label><input name="team_name" required maxLength={120} /></div>
              <h4 style="margin-top:22px; font-size:15px;">Team Leader</h4>
              <div class="form-row-2">
                <div class="field"><label>Full Name *</label><input name="leader_name" required maxLength={120} /></div>
                <div class="field"><label>Email *</label><input type="email" name="leader_email" required maxLength={160} /></div>
              </div>
              <div class="form-row-2">
                <div class="field"><label>USN / Student ID *</label><input name="leader_usn" required maxLength={40} /></div>
                <div class="field"><label>Phone *</label><input name="leader_phone" required maxLength={20} pattern="[0-9+ -]{7,20}" /></div>
              </div>
              <div class="field"><label>Set a password for your student login *</label><input type="password" name="password" required minLength={8} />
                <div class="hint">You'll use your leader email and this password to log in to the student portal.</div>
              </div>
              <div style="display:flex; justify-content:space-between;"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="button" class="btn btn-primary" data-next>Continue &rarr;</button></div>
            </div>

            {/* STEP 3: Members */}
            <div class="wizard-step" style="display:none;">
              <h3>Team Members</h3>
              <p class="hint">Add the remaining team members (not including the leader). Your team needs {s.team_size_min}–{s.team_size_max} members in total.</p>
              <div id="member-list"></div>
              <button type="button" id="add-member-btn" class="btn btn-ghost btn-sm">+ Add Member</button>
              <template id="member-template">
                <div class="member-row">
                  <button type="button" class="remove-member btn btn-danger btn-sm">Remove</button>
                  <div class="form-row-2">
                    <div class="field"><label>Full Name *</label><input name="member_name_[]" required maxLength={120} /></div>
                    <div class="field"><label>Email *</label><input type="email" name="member_email_[]" required maxLength={160} /></div>
                  </div>
                  <div class="form-row-2">
                    <div class="field"><label>USN / Student ID *</label><input name="member_usn_[]" required maxLength={40} /></div>
                    <div class="field"><label>Department *</label><input name="member_dept_[]" required maxLength={120} /></div>
                  </div>
                  <div class="field" style="max-width:160px;"><label>Year *</label>
                    <select name="member_year_[]" required>
                      <option value="">Select</option>
                      <option>1st Year</option><option>2nd Year</option><option>3rd Year</option><option>4th Year</option>
                    </select>
                  </div>
                </div>
              </template>
              <div style="display:flex; justify-content:space-between; margin-top:16px;"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="button" class="btn btn-primary" data-next>Continue &rarr;</button></div>
            </div>

            {/* STEP 4: Project */}
            <div class="wizard-step" style="display:none;">
              <h3>Project Details</h3>
              <div class="field"><label>Project Title *</label><input name="project_title" required maxLength={160} /></div>
              <div class="field"><label>Category *</label>
                <select name="category_id" required>
                  <option value="">Select a category</option>
                  {categories.map((cat) => <option value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div class="field"><label>Problem Statement *</label><textarea name="problem_statement" required maxLength={2000}></textarea></div>
              <div class="field"><label>Solution Description *</label><textarea name="solution_description" required maxLength={2000}></textarea></div>
              <div class="field"><label>Technologies (comma separated) *</label><input name="technologies" required placeholder="e.g. React, Node.js, Arduino" maxLength={300} /></div>
              <div class="field"><label>Expected Outcome</label><textarea name="expected_outcome" maxLength={1000}></textarea></div>
              <div style="display:flex; justify-content:space-between;"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="button" class="btn btn-primary" data-next>Continue &rarr;</button></div>
            </div>

            {/* STEP 5: Mentor */}
            <div class="wizard-step" style="display:none;">
              <h3>Faculty Mentor</h3>
              <div class="form-row-2">
                <div class="field"><label>Name *</label><input name="mentor_name" required maxLength={120} /></div>
                <div class="field"><label>Department *</label><input name="mentor_department" required maxLength={120} /></div>
              </div>
              <div class="form-row-2">
                <div class="field"><label>Email *</label><input type="email" name="mentor_email" required maxLength={160} /></div>
                <div class="field"><label>Phone *</label><input name="mentor_phone" required maxLength={20} /></div>
              </div>
              <div style="display:flex; justify-content:space-between;"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="button" class="btn btn-primary" data-next>Continue &rarr;</button></div>
            </div>

            {/* STEP 6: Documents */}
            <div class="wizard-step" style="display:none;">
              <h3>Documents</h3>
              <div class="field"><label>Project Abstract (PDF/DOC, required) *</label><input type="file" name="abstract" accept=".pdf,.doc,.docx" required /></div>
              <div class="field"><label>Project Presentation (PPT/PDF, optional)</label><input type="file" name="presentation" accept=".pdf,.ppt,.pptx" /></div>
              <div class="field"><label>Project Images (optional, up to 3)</label><input type="file" name="images" accept=".png,.jpg,.jpeg,.webp" multiple /></div>
              <div class="hint">Max 10MB per file.</div>
              <div style="display:flex; justify-content:space-between;"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="button" class="btn btn-primary" data-next>Continue &rarr;</button></div>
            </div>

            {/* STEP 7: Review */}
            <div class="wizard-step" style="display:none;">
              <h3>Review &amp; Submit</h3>
              <p class="hint">Please check everything carefully. You won't be able to edit most of this after submission.</p>
              <div id="review-box" style="border:1px solid var(--line); border-radius:12px; padding:4px 16px; margin-bottom:18px;"></div>
              <div class="checkbox-row" style="margin-bottom:20px;">
                <input type="checkbox" id="consent" name="consent" required />
                <label for="consent" style="font-weight:500;">I confirm that the information provided is accurate and agree to follow the Mini Anveshana guidelines.</label>
              </div>
              <div style="display:flex; justify-content:space-between;"><button type="button" class="btn btn-ghost" data-back>&larr; Back</button><button type="submit" class="btn btn-primary">Submit Registration</button></div>
            </div>
          </form>
        </div>
      </section>
      <script src="/static/register.js"></script>
    </SiteLayout>
  )
})

registerRoutes.post('/register', async (c) => {
  const s = await getSettings(c.get('db'))
  if (!s.registration_open) return c.redirect('/register?error=' + encodeURIComponent('Registration is currently closed.'))
  const uploadedKeys: string[] = []

  try {
    const body = await c.req.parseBody({ all: true })

    const collegeName = sanitizeText(body.college_name as string, 200)
    const university = sanitizeText(body.university as string, 200)
    const department = sanitizeText(body.department as string, 120)
    const city = sanitizeText(body.city as string, 120)
    const state = sanitizeText(body.state as string, 120)
    const teamName = sanitizeText(body.team_name as string, 120)
    const leaderName = sanitizeText(body.leader_name as string, 120)
    const leaderEmail = sanitizeText(body.leader_email as string, 160).toLowerCase()
    const leaderUsn = sanitizeText(body.leader_usn as string, 40)
    const leaderPhone = sanitizeText(body.leader_phone as string, 20)
    const password = (body.password as string) || ''
    const projectTitle = sanitizeText(body.project_title as string, 160)
    const categoryId = parseInt(body.category_id as string, 10)
    const problemStatement = sanitizeText(body.problem_statement as string, 2000)
    const solutionDescription = sanitizeText(body.solution_description as string, 2000)
    const technologies = sanitizeText(body.technologies as string, 300)
    const expectedOutcome = sanitizeText(body.expected_outcome as string, 1000)
    const mentorName = sanitizeText(body.mentor_name as string, 120)
    const mentorDept = sanitizeText(body.mentor_department as string, 120)
    const mentorEmail = sanitizeText(body.mentor_email as string, 160)
    const mentorPhone = sanitizeText(body.mentor_phone as string, 20)
    const consent = body.consent === 'on' || body.consent === 'true'

    if (!collegeName || !university || !department || !city || !state) throw new Error('Please complete all college information fields.')
    if (!teamName || !leaderName || !isEmail(leaderEmail) || !leaderUsn || !leaderPhone) throw new Error('Please complete all team/leader fields correctly.')
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.')
    if (!projectTitle || !categoryId || !problemStatement || !solutionDescription || !technologies) throw new Error('Please complete all project fields.')
    if (!mentorName || !mentorDept || !isEmail(mentorEmail) || !mentorPhone) throw new Error('Please complete all faculty mentor fields.')
    if (!consent) throw new Error('You must confirm the accuracy of your information to proceed.')

    // Members (arrays)
    const memberNames = ([] as string[]).concat((body['member_name_[]'] as any) || [])
    const memberEmails = ([] as string[]).concat((body['member_email_[]'] as any) || [])
    const memberUsns = ([] as string[]).concat((body['member_usn_[]'] as any) || [])
    const memberDepts = ([] as string[]).concat((body['member_dept_[]'] as any) || [])
    const memberYears = ([] as string[]).concat((body['member_year_[]'] as any) || [])

    const totalTeamSize = memberNames.filter(Boolean).length + 1 // + leader
    if (totalTeamSize < s.team_size_min || totalTeamSize > s.team_size_max) {
      throw new Error(`Team size must be between ${s.team_size_min} and ${s.team_size_max} members (including leader). You have ${totalTeamSize}.`)
    }

    // check for duplicate leader email as existing user
    const existingUser = await c.get('db').one<{ id: number }>('SELECT id FROM users WHERE email = ?', [leaderEmail])
    if (existingUser) throw new Error('An account with this leader email already exists. Please use a different email or log in to manage your existing team.')

    const passwordHash = await hashPassword(password)
    const { registrationId, teamId, projectId } = await c.get('db').transaction(async (db) => {
      const college = await ensureCollege(db, collegeName, university, city, state)
      const registrationId = await nextRegistrationId(db, new Date().getFullYear())
      const qrToken = newQrToken()
      const user = await db.one<{ id: number }>(
        'INSERT INTO users (email, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [leaderEmail, passwordHash, leaderName, 'student', leaderPhone]
      )
      const team = await db.one<{ id: number }>(
        `INSERT INTO teams (registration_id, team_name, college_id, department, leader_user_id, leader_name, leader_email, leader_usn, leader_phone, status, qr_token, consent_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 1) RETURNING id`,
        [registrationId, teamName, college.id, department, user!.id, leaderName, leaderEmail, leaderUsn, leaderPhone, qrToken]
      )
      const teamId = team!.id
      await db.execute('INSERT INTO team_members (team_id, user_id, full_name, email, usn, department, year, is_leader, invitation_status) VALUES (?,?,?,?,?,?,?,1,\'accepted\')', [teamId, user!.id, leaderName, leaderEmail, leaderUsn, department, 'Leader'])
      for (let i = 0; i < memberNames.length; i++) {
        if (!memberNames[i]) continue
        await db.execute('INSERT INTO team_members (team_id, full_name, email, usn, department, year, is_leader, invitation_status) VALUES (?,?,?,?,?,?,0,\'accepted\')', [teamId, sanitizeText(memberNames[i], 120), sanitizeText(memberEmails[i], 160).toLowerCase(), sanitizeText(memberUsns[i], 40), sanitizeText(memberDepts[i], 120), sanitizeText(memberYears[i], 20)])
      }
      await db.execute('INSERT INTO faculty_coordinators (team_id, name, department, email, phone) VALUES (?,?,?,?,?)', [teamId, mentorName, mentorDept, mentorEmail, mentorPhone])
      const project = await db.one<{ id: number }>(
        `INSERT INTO projects (team_id, category_id, title, problem_statement, solution_description, technologies, expected_outcome, status)
         VALUES (?,?,?,?,?,?,?, 'submitted') RETURNING id`,
        [teamId, categoryId, projectTitle, problemStatement, solutionDescription, technologies, expectedOutcome]
      )
      await db.execute("UPDATE projects SET submitted_at = now() WHERE id = ?", [project!.id])
      return { registrationId, teamId, projectId: project!.id }
    })

    const manifest = parseUploadManifest(body.storage_files)
    uploadedKeys.push(...manifest.map((file) => file.path))
    const uploadedFiles = await confirmUploadManifest(getStorage(c.env), manifest, 'pending/registrations/')
    if (!uploadedFiles.some((file) => file.type === 'abstract')) throw new Error('Project abstract file is required.')

    await c.get('db').transaction(async (db) => {
      for (const file of uploadedFiles) {
        await db.execute('INSERT INTO project_files (project_id, file_type, file_name, r2_key, content_type, size_bytes) VALUES (?,?,?,?,?,?)', [projectId, file.type, file.name, file.path, file.contentType, file.size])
      }
      await logAudit(db, null, 'registration_submitted', 'team', teamId, `Registration ${registrationId} submitted by ${leaderEmail}`)
    })

    return c.redirect(`/registration/success?id=${encodeURIComponent(registrationId)}`)
  } catch (err: any) {
    if (uploadedKeys.length > 0) await getStorage(c.env).remove(uploadedKeys).catch(() => undefined)
    return c.redirect('/register?error=' + encodeURIComponent(err?.message || 'Something went wrong. Please check your details and try again.'))
  }
})

async function ensureCollege(db: PostgresDatabase, name: string, university: string, city: string, state: string) {
  const existing = await db.one<{ id: number }>('SELECT id FROM colleges WHERE name = ? AND city = ?', [name, city])
  if (existing) return existing
  const created = await db.one<{ id: number }>('INSERT INTO colleges (name, university, city, state) VALUES (?,?,?,?) RETURNING id', [name, university, city, state])
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
