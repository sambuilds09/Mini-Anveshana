import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'

const adminAnalytics = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminAnalytics.use('/admin/analytics', requireRole('organizer', 'super_admin'))

adminAnalytics.get('/admin/analytics', async (c) => {
  const user = c.get('user' as never) as any
  const db = c.get('db')

  const byCollege = await db.many<any>(`SELECT col.name, COUNT(*) as n FROM teams t JOIN colleges col ON col.id = t.college_id GROUP BY col.id ORDER BY n DESC`)
  const byCategory = await db.many<any>(`SELECT cat.name, COUNT(*) as n FROM projects p JOIN categories cat ON cat.id = p.category_id GROUP BY cat.id ORDER BY n DESC`)
  const byStatus = await db.many<any>(`SELECT status, COUNT(*) as n FROM teams GROUP BY status`)
  const byDay = await db.many<any>(`SELECT date(created_at) as day, COUNT(*) as n FROM teams GROUP BY day ORDER BY day`)
  const scoreDist = await db.many<any>(`SELECT total_score FROM evaluations WHERE status='completed' AND total_score IS NOT NULL`)
  const checkinRate = await db.one<any>(`SELECT (SELECT COUNT(*) FROM teams WHERE checked_in=1) as checked, (SELECT COUNT(*) FROM teams WHERE status IN ('registered','approved')) as approved`)
  const projSubmitRate = await db.one<any>(`SELECT (SELECT COUNT(*) FROM projects WHERE status IN ('submitted','reviewed')) as submitted, (SELECT COUNT(*) FROM teams WHERE status IN ('registered','approved')) as approved`)
  const evalRate = await db.one<any>(`SELECT (SELECT COUNT(*) FROM evaluations WHERE status='completed') as done, (SELECT COUNT(*) FROM evaluator_assignments) as total`)

  const maxCollege = Math.max(1, ...byCollege.map((r) => r.n))
  const maxCategory = Math.max(1, ...byCategory.map((r) => r.n))
  const maxDay = Math.max(1, ...byDay.map((r) => r.n))

  const scoreBuckets = [0, 0, 0, 0, 0] // 0-20,20-40,40-60,60-80,80-100
  scoreDist.forEach((s: any) => {
    const idx = Math.min(4, Math.floor(s.total_score / 20))
    scoreBuckets[idx]++
  })
  const maxBucket = Math.max(1, ...scoreBuckets)

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

  return c.render(
    <AppShell title="Analytics" role="organizer" userName={user.full_name} activePath="/admin/analytics" subtitle="Live data from the registrations database — no mock numbers.">
      <div class="toolbar" style="justify-content:flex-end;">
        <a href="/admin/registrations/export.csv" class="btn btn-ghost btn-sm">Export Registrations CSV</a>
      </div>

      <div class="grid-3" style="margin-bottom:24px;">
        <div class="dashboard-card">
          <h3>Check-in Rate</h3>
          <div class="meta">{checkinRate?.checked || 0} / {checkinRate?.approved || 0} approved teams</div>
          <div class="progress-bar"><span style={`width:${pct(checkinRate?.checked || 0, checkinRate?.approved || 0)}%`}></span></div>
        </div>
        <div class="dashboard-card">
          <h3>Project Submission Rate</h3>
          <div class="meta">{projSubmitRate?.submitted || 0} / {projSubmitRate?.approved || 0} approved teams</div>
          <div class="progress-bar"><span style={`width:${pct(projSubmitRate?.submitted || 0, projSubmitRate?.approved || 0)}%`}></span></div>
        </div>
        <div class="dashboard-card">
          <h3>Evaluation Completion</h3>
          <div class="meta">{evalRate?.done || 0} / {evalRate?.total || 0} assignments</div>
          <div class="progress-bar"><span style={`width:${pct(evalRate?.done || 0, evalRate?.total || 0)}%`}></span></div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:24px;">
        <div class="dashboard-card">
          <h3>Registrations by College</h3>
          {byCollege.length === 0 ? <p class="hint">No data yet.</p> : byCollege.map((r) => (
            <div style="margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span>{r.name}</span><span style="font-weight:700;">{r.n}</span></div>
              <div class="progress-bar"><span style={`width:${(r.n / maxCollege) * 100}%`}></span></div>
            </div>
          ))}
        </div>
        <div class="dashboard-card">
          <h3>Category Distribution</h3>
          {byCategory.length === 0 ? <p class="hint">No data yet.</p> : byCategory.map((r) => (
            <div style="margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span>{r.name}</span><span style="font-weight:700;">{r.n}</span></div>
              <div class="progress-bar"><span style={`width:${(r.n / maxCategory) * 100}%; background:var(--amber-500);`}></span></div>
            </div>
          ))}
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:24px;">
        <div class="dashboard-card">
          <h3>Approval Status Breakdown</h3>
          {byStatus.map((r) => (
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
              <span style="text-transform:capitalize;">{r.status.replace('_', ' ')}</span><span style="font-weight:700;">{r.n}</span>
            </div>
          ))}
        </div>
        <div class="dashboard-card">
          <h3>Score Distribution</h3>
          {scoreDist.length === 0 ? <p class="hint">No completed evaluations yet.</p> : (
            <div style="display:flex; gap:10px; align-items:flex-end; height:120px; padding-top:10px;">
              {scoreBuckets.map((n, i) => (
                <div style="flex:1; text-align:center;">
                  <div style={`background:var(--blue-500); height:${(n / maxBucket) * 90}px; border-radius:4px 4px 0 0;`}></div>
                  <div style="font-size:11px; color:var(--ink-500); margin-top:4px;">{i * 20}-{i * 20 + 20}</div>
                  <div style="font-size:12px; font-weight:700;">{n}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div class="dashboard-card">
        <h3>Registrations Over Time</h3>
        {byDay.length === 0 ? <p class="hint">No registrations yet.</p> : (
          <div style="display:flex; gap:6px; align-items:flex-end; height:120px; padding-top:10px; overflow-x:auto;">
            {byDay.map((r) => (
              <div style="text-align:center; min-width:34px;">
                <div style={`background:var(--navy-900); height:${(r.n / maxDay) * 90}px; border-radius:4px 4px 0 0;`}></div>
                <div style="font-size:10px; color:var(--ink-500); margin-top:4px;">{r.day.slice(5)}</div>
                <div style="font-size:11px; font-weight:700;">{r.n}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
})

export default adminAnalytics
