import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'

const adminDashboard = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminDashboard.use('/admin/dashboard', requireRole('organizer', 'super_admin'))

adminDashboard.get('/admin/dashboard', async (c) => {
  const user = c.get('user' as never) as any
  const db = c.get('db')

  const totalTeams = await db.one<{ n: number }>('SELECT COUNT(*) as n FROM teams')
  const approved = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE status = 'approved'`)
  const pending = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE status IN ('submitted','under_review')`)
  const rejected = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE status = 'rejected'`)
  const checkedIn = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE checked_in = 1`)
  const projectsSubmitted = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM projects WHERE status IN ('submitted','reviewed')`)
  const evalsCompleted = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM evaluations WHERE status = 'completed'`)
  const evalsTotal = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM evaluator_assignments`)
  const collegesCount = await db.one<{ n: number }>(`SELECT COUNT(DISTINCT college_id) as n FROM teams`)

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

  const recentTeams = await db.many<any>(`SELECT t.registration_id, t.team_name, t.status, col.name as college_name, t.created_at FROM teams t JOIN colleges col ON col.id = t.college_id ORDER BY t.id DESC LIMIT 6`)

  return c.render(
    <AppShell title="Live Event Dashboard" role="organizer" userName={user.full_name} activePath="/admin/dashboard" subtitle="Real-time snapshot of Mini Anveshana registrations and event progress.">
      <div class="dashboard-card" style="margin-bottom:28px;">
        <h3>Start Here</h3>
        <p class="meta">Use these shortcuts to set up the event and manage the information shown on the website.</p>
        <div class="grid-4">
          <a href="/admin/settings" class="card"><strong>Event details</strong><span class="hint">Name, dates, venue, deadlines</span></a>
          <a href="/admin/schedule" class="card"><strong>Event schedule</strong><span class="hint">Add, edit, or remove time slots</span></a>
          <a href="/admin/categories" class="card"><strong>Categories</strong><span class="hint">Add tracks for projects</span></a>
          <a href="/admin/announcements" class="card"><strong>Announcements</strong><span class="hint">Post updates for participants</span></a>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom:28px;">
        <div class="stat-card"><div class="label">Total Teams</div><div class="value">{totalTeams?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Approved</div><div class="value">{approved?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Pending Review</div><div class="value">{pending?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Rejected</div><div class="value">{rejected?.n || 0}</div></div>
      </div>

      <div class="grid-2" style="margin-bottom:28px;">
        <div class="dashboard-card">
          <h3>Check-in Progress</h3>
          <div class="meta">{checkedIn?.n || 0} / {approved?.n || 0} approved teams checked in</div>
          <div class="progress-bar"><span style={`width:${pct(checkedIn?.n || 0, approved?.n || 0)}%`}></span></div>
        </div>
        <div class="dashboard-card">
          <h3>Evaluation Progress</h3>
          <div class="meta">{evalsCompleted?.n || 0} / {evalsTotal?.n || 0} assigned evaluations completed</div>
          <div class="progress-bar"><span style={`width:${pct(evalsCompleted?.n || 0, evalsTotal?.n || 0)}%`}></span></div>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:28px;">
        <div class="stat-card"><div class="label">Projects Submitted</div><div class="value">{projectsSubmitted?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Participating Colleges</div><div class="value">{collegesCount?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Evaluations Completed</div><div class="value">{evalsCompleted?.n || 0}</div></div>
      </div>

      <div class="dashboard-card">
        <h3>Recent Registrations</h3>
        <div class="table-wrap" style="border:none; margin-top:10px;">
          <table class="data-table">
            <thead><tr><th>Reg. ID</th><th>Team</th><th>College</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              {recentTeams.length === 0 ? (
                <tr><td colspan={5} style="text-align:center; color:var(--ink-500);">No registrations yet.</td></tr>
              ) : recentTeams.map((t) => (
                <tr>
                  <td>{t.registration_id}</td>
                  <td>{t.team_name}</td>
                  <td>{t.college_name}</td>
                  <td><span class={`badge ${t.status === 'approved' ? 'badge-success' : t.status === 'rejected' ? 'badge-danger' : 'badge-warn'}`}>{t.status}</span></td>
                  <td>{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a href="/admin/registrations" class="btn btn-ghost btn-sm" style="margin-top:14px;">View all registrations &rarr;</a>
      </div>
    </AppShell>
  )
})

export default adminDashboard
