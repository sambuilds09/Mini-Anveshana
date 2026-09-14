import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { sanitizeText } from '../lib/validation'
import { logAudit } from '../lib/audit'

const adminColleges = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminColleges.use('/admin/colleges', requireRole('organizer', 'super_admin'))
adminColleges.use('/admin/colleges/*', requireRole('organizer', 'super_admin'))
adminColleges.use('/admin/teams', requireRole('organizer', 'super_admin'))

adminColleges.get('/admin/colleges', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>(
        `SELECT col.*, 
          (SELECT COUNT(*) FROM teams t WHERE t.college_id = col.id) as team_count,
          (SELECT COUNT(*) FROM team_members m JOIN teams t ON t.id = m.team_id WHERE t.college_id = col.id) as participant_count,
          (SELECT COUNT(*) FROM projects p JOIN teams t ON t.id = p.team_id WHERE t.college_id = col.id AND p.status IN ('submitted','reviewed')) as project_count,
          (SELECT COUNT(*) FROM teams t WHERE t.college_id = col.id AND t.checked_in = 1) as checkin_count
         FROM colleges col ORDER BY col.name`
        )

  return c.render(
    <AppShell title="Colleges" role="organizer" userName={user.full_name} activePath="/admin/colleges" subtitle={`${rows.length} participating colleges`}>
      <div class="dashboard-card" style="margin-bottom:24px;">
        <h3>Add College</h3>
        <p class="hint">Add a college here before registering teams, or let registration create it automatically.</p>
        <form method="post" action="/admin/colleges">
          <div class="form-row-2">
            <div class="field"><label>College Name *</label><input name="name" required /></div>
            <div class="field"><label>University</label><input name="university" /></div>
          </div>
          <div class="form-row-2">
            <div class="field"><label>City *</label><input name="city" required /></div>
            <div class="field"><label>State *</label><input name="state" required /></div>
          </div>
          <div class="form-row-2">
            <div class="field"><label>Coordinator Name</label><input name="coordinator_name" /></div>
            <div class="field"><label>Coordinator Email</label><input type="email" name="coordinator_email" /></div>
          </div>
          <div class="field" style="max-width:260px;"><label>Coordinator Phone</label><input name="coordinator_phone" /></div>
          <button type="submit" class="btn btn-primary btn-sm">Add College</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#127979;</div><h3>No colleges yet</h3><p>Colleges are added automatically when teams register, or you can add them manually above.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>College</th><th>University</th><th>City/State</th><th>Coordinator</th><th>Teams</th><th>Participants</th><th>Projects</th><th>Check-ins</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((col) => (
                <tr>
                  <td style="font-weight:600;">{col.name}</td>
                  <td>{col.university || '—'}</td>
                  <td>{col.city}, {col.state}</td>
                  <td>{col.coordinator_name ? `${col.coordinator_name} (${col.coordinator_email || 'n/a'})` : '—'}</td>
                  <td>{col.team_count}</td>
                  <td>{col.participant_count}</td>
                  <td>{col.project_count}</td>
                  <td>{col.checkin_count}</td>
                  <td><a href={`/admin/registrations?college=${col.id}`} class="btn btn-ghost btn-sm">View Teams</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
})

adminColleges.post('/admin/colleges', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const name = sanitizeText(body.name as string, 200)
  const university = sanitizeText(body.university as string, 200)
  const city = sanitizeText(body.city as string, 120)
  const state = sanitizeText(body.state as string, 120)
  const coordinatorName = sanitizeText(body.coordinator_name as string, 120)
  const coordinatorEmail = sanitizeText(body.coordinator_email as string, 160)
  const coordinatorPhone = sanitizeText(body.coordinator_phone as string, 20)
  if (!name || !city || !state) return c.redirect('/admin/colleges')

  await c.get('db').execute('INSERT INTO colleges (name, university, city, state, coordinator_name, coordinator_email, coordinator_phone) VALUES (?,?,?,?,?,?,?) ON CONFLICT (name, city) DO NOTHING', [name, university, city, state, coordinatorName, coordinatorEmail, coordinatorPhone])
  await logAudit(c.get('db'), user.id, 'college_added', 'college', undefined, name)
  return c.redirect('/admin/colleges')
})

export default adminColleges
