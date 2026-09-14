import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { logAudit } from '../lib/audit'

const adminCheckin = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminCheckin.use('/admin/check-in', requireRole('organizer', 'super_admin'))
adminCheckin.use('/admin/check-in/*', requireRole('organizer', 'super_admin'))

adminCheckin.get('/admin/check-in', async (c) => {
  const user = c.get('user' as never) as any
  const totalApproved = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE status='approved'`)
  const checkedIn = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE checked_in = 1`)
  const recent = await c.get('db').many<any>(`SELECT team_name, checkin_time FROM checkins JOIN teams ON teams.id = checkins.team_id WHERE result='success' ORDER BY checkins.id DESC LIMIT 8`)

  return c.render(
    <AppShell title="QR Check-in" role="organizer" userName={user.full_name} activePath="/admin/check-in" subtitle={`${checkedIn?.n || 0} / ${totalApproved?.n || 0} approved teams checked in`}>
      <div class="grid-2" style="align-items:flex-start;">
        <div>
          <div class="scan-frame">
            <video id="scanner-video" muted playsinline></video>
          </div>
          <div id="scan-status" class="scan-status">Tap "Start Camera" to begin scanning.</div>
          <div style="text-align:center; margin:14px 0;">
            <button id="start-scan-btn" class="btn btn-primary">Start Camera</button>
            <span id="queue-badge" class="badge badge-warn" style="margin-left:8px;">Queued: <span id="queue-count">0</span></span>
          </div>
          <form id="manual-checkin-form" class="form-card" style="margin-top:10px;">
            <div class="field"><label>Manual entry (registration token or verify URL)</label><input id="manual-token" placeholder="Paste QR token or scan URL" /></div>
            <button type="submit" class="btn btn-dark btn-block">Check In Manually</button>
          </form>
        </div>
        <div>
          <div id="scan-result" class="dashboard-card" style="min-height:160px;">
            <h3>Scan Result</h3>
            <p class="hint">Team details will appear here after a successful scan.</p>
          </div>
          <div class="dashboard-card" style="margin-top:16px;">
            <h3>Recent Check-ins</h3>
            {recent.length === 0 ? <p class="hint">No check-ins yet.</p> : recent.map((r) => (
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
                <span>{r.team_name}</span><span style="color:var(--ink-500);">{new Date(r.checkin_time).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <script src="/static/scanner.js"></script>
    </AppShell>
  )
})

adminCheckin.post('/admin/check-in/scan', async (c) => {
  const admin = c.get('user' as never) as any
  let token = ''
  try {
    const body = await c.req.json<{ token: string }>()
    token = (body.token || '').trim()
  } catch {
    return c.json({ message: 'Invalid request.' }, 400)
  }
  if (!token) return c.json({ message: 'Empty QR token.' }, 400)

  const team = await c.get('db').one<any>(`SELECT t.*, col.name as college_name FROM teams t JOIN colleges col ON col.id = t.college_id WHERE t.qr_token = ?`, [token])
  if (!team) {
    await c.get('db').execute(`INSERT INTO checkins (team_id, scanned_by, result) VALUES (NULL, ?, 'invalid')`, [admin.id]).catch(() => {})
    return c.json({ message: 'QR code not recognized.' }, 404)
  }

  const project = await c.get('db').one<any>(`SELECT p.title as project_title, cat.name as category_name FROM projects p LEFT JOIN categories cat ON cat.id = p.category_id WHERE p.team_id = ?`, [team.id])

  if (team.checked_in) {
    await c.get('db').execute(`INSERT INTO checkins (team_id, scanned_by, result) VALUES (?,?, 'duplicate')`, [team.id, admin.id])
    return c.json({
      duplicate: true,
      team_name: team.team_name,
      college_name: team.college_name,
      registration_id: team.registration_id,
      category_name: project?.category_name,
      project_title: project?.project_title,
      checked_in_at: new Date(team.checked_in_at).toLocaleTimeString(),
    })
  }

  if (team.status !== 'approved') {
    return c.json({ message: `This team's registration status is "${team.status}", not approved.` }, 409)
  }

  await c.get('db').execute(`UPDATE teams SET checked_in = 1, checked_in_at = now(), checked_in_by = ? WHERE id = ?`, [admin.id, team.id])
  await c.get('db').execute(`INSERT INTO checkins (team_id, scanned_by, result) VALUES (?,?, 'success')`, [team.id, admin.id])
  await logAudit(c.get('db'), admin.id, 'team_checked_in', 'team', team.id)

  return c.json({
    duplicate: false,
    team_name: team.team_name,
    college_name: team.college_name,
    registration_id: team.registration_id,
    category_name: project?.category_name,
    project_title: project?.project_title,
  })
})

export default adminCheckin
