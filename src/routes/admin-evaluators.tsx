import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { sanitizeText, isEmail } from '../lib/validation'
import { hashPassword, randomToken } from '../lib/auth'
import { logAudit } from '../lib/audit'

const adminEvaluators = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminEvaluators.use('/admin/evaluators', requireRole('organizer', 'super_admin'))
adminEvaluators.use('/admin/evaluators/*', requireRole('organizer', 'super_admin'))

adminEvaluators.get('/admin/evaluators', async (c) => {
  const user = c.get('user' as never) as any
  const projectFilter = c.req.query('project') || ''
  const success = c.req.query('success')

  const evaluators = await c.get('db').many<any>(
        `SELECT ev.id, u.full_name, u.email, ev.organization, ev.expertise,
          (SELECT COUNT(*) FROM evaluator_assignments ea WHERE ea.evaluator_id = ev.id) as assigned_count,
          (SELECT COUNT(*) FROM evaluations e WHERE e.evaluator_id = ev.id AND e.status='completed') as completed_count
         FROM evaluators ev JOIN users u ON u.id = ev.user_id ORDER BY u.full_name`
        )

  const projects = await c.get('db').many<any>(`SELECT p.id, p.title, t.team_name FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.status='approved' ORDER BY p.title`)

  let assignments: any[] = []
  if (projectFilter) {
    assignments = await c.get('db').many<any>(`SELECT ea.*, u.full_name FROM evaluator_assignments ea JOIN evaluators ev ON ev.id = ea.evaluator_id JOIN users u ON u.id = ev.user_id WHERE ea.project_id = ?`, [projectFilter])
  }

  return c.render(
    <AppShell title="Evaluators" role="organizer" userName={user.full_name} activePath="/admin/evaluators">
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      <div class="grid-2" style="align-items:flex-start; margin-bottom:24px;">
        <div class="dashboard-card">
          <h3>Add Evaluator</h3>
          <form method="post" action="/admin/evaluators">
            <div class="form-row-2">
              <div class="field"><label>Full Name *</label><input name="full_name" required /></div>
              <div class="field"><label>Email *</label><input type="email" name="email" required /></div>
            </div>
            <div class="form-row-2">
              <div class="field"><label>Organization</label><input name="organization" /></div>
              <div class="field"><label>Expertise</label><input name="expertise" placeholder="e.g. AI, Web, Hardware" /></div>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Create Evaluator Account</button>
          </form>
        </div>

        <div class="dashboard-card">
          <h3>Assign Evaluator to Project</h3>
          <form method="post" action="/admin/evaluators/assign">
            <div class="field"><label>Project *</label>
              <select name="project_id" required>
                <option value="">Select project</option>
                {projects.map((p) => <option value={p.id} selected={String(p.id) === projectFilter}>{p.title} — {p.team_name}</option>)}
              </select>
            </div>
            <div class="field"><label>Evaluator *</label>
              <select name="evaluator_id" required>
                <option value="">Select evaluator</option>
                {evaluators.map((e) => <option value={e.id}>{e.full_name} ({e.email})</option>)}
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-sm">Assign</button>
          </form>
          {projectFilter && (
            <div style="margin-top:14px;">
              <h4 style="font-size:13px;">Currently assigned</h4>
              {assignments.length === 0 ? <p class="hint">No evaluators assigned to this project yet.</p> : assignments.map((a) => <span class="tag">{a.full_name}</span>)}
            </div>
          )}
        </div>
      </div>

      {evaluators.length === 0 ? (
        <div class="empty-state"><div class="icon">&#129489;&#8205;&#127979;</div><h3>No evaluators yet</h3><p>Add your first evaluator using the form above.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Organization</th><th>Expertise</th><th>Assigned</th><th>Completed</th></tr></thead>
            <tbody>
              {evaluators.map((e) => (
                <tr>
                  <td style="font-weight:600;">{e.full_name}</td>
                  <td>{e.email}</td>
                  <td>{e.organization || '—'}</td>
                  <td>{e.expertise || '—'}</td>
                  <td>{e.assigned_count}</td>
                  <td>{e.completed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
})

adminEvaluators.post('/admin/evaluators', async (c) => {
  const admin = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const fullName = sanitizeText(body.full_name as string, 120)
  const email = sanitizeText(body.email as string, 160).toLowerCase()
  const organization = sanitizeText(body.organization as string, 160)
  const expertise = sanitizeText(body.expertise as string, 160)
  if (!fullName || !isEmail(email)) return c.redirect('/admin/evaluators')

  const existing = await c.get('db').one<any>('SELECT id FROM users WHERE email = ?', [email])
  if (existing) return c.redirect('/admin/evaluators')

  const tempPassword = randomToken(6)
  const hash = await hashPassword(tempPassword)
  const createdUser = await c.get('db').one<{ id: number }>('INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,\'evaluator\') RETURNING id', [email, hash, fullName])
  const uid = createdUser!.id
  await c.get('db').execute('INSERT INTO evaluators (user_id, organization, expertise) VALUES (?,?,?)', [uid, organization, expertise])
  await logAudit(c.get('db'), admin.id, 'evaluator_created', 'user', uid, email)

  return c.redirect('/admin/evaluators?success=' + encodeURIComponent(`Evaluator created. Temporary password: ${tempPassword} (share securely — this is shown once).`))
})

adminEvaluators.post('/admin/evaluators/assign', async (c) => {
  const admin = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const projectId = parseInt(body.project_id as string, 10)
  const evaluatorId = parseInt(body.evaluator_id as string, 10)
  if (!projectId || !evaluatorId) return c.redirect('/admin/evaluators')

  await c.get('db').execute('INSERT INTO evaluator_assignments (evaluator_id, project_id, assigned_by) VALUES (?,?,?) ON CONFLICT (evaluator_id, project_id) DO NOTHING', [evaluatorId, projectId, admin.id])
  const assignment = await c.get('db').one<any>('SELECT id FROM evaluator_assignments WHERE evaluator_id = ? AND project_id = ?', [evaluatorId, projectId])
  await c.get('db').execute(`INSERT INTO evaluations (assignment_id, evaluator_id, project_id, status) VALUES (?,?,?,'pending') ON CONFLICT (evaluator_id, project_id) DO NOTHING`, [assignment!.id, evaluatorId, projectId])
  await logAudit(c.get('db'), admin.id, 'evaluator_assigned', 'project', projectId, `Evaluator ${evaluatorId}`)

  return c.redirect(`/admin/evaluators?project=${projectId}&success=` + encodeURIComponent('Evaluator assigned.'))
})

export default adminEvaluators
