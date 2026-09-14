import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { computeProjectScore } from '../lib/db-helpers'
import { getSettings } from '../lib/settings'
import { logAudit } from '../lib/audit'

const adminResults = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminResults.use('/admin/results', requireRole('organizer', 'super_admin'))
adminResults.use('/admin/results/*', requireRole('organizer', 'super_admin'))

adminResults.get('/admin/results', async (c) => {
  const user = c.get('user' as never) as any
  const s = await getSettings(c.get('db'))
  const success = c.req.query('success')

  const rows = await c.get('db').many<any>(
        `SELECT p.id, p.title, p.final_score, t.team_name, col.name as college_name, cat.name as category_name,
          (SELECT COUNT(*) FROM evaluations e WHERE e.project_id = p.id AND e.status='completed') as eval_count
         FROM projects p JOIN teams t ON t.id = p.team_id JOIN colleges col ON col.id = t.college_id LEFT JOIN categories cat ON cat.id = p.category_id
         WHERE t.status IN ('registered','approved')
         ORDER BY p.final_score DESC NULLS LAST, p.title`
        )

  return c.render(
    <AppShell title="Results" role="organizer" userName={user.full_name} activePath="/admin/results" subtitle={`Scoring formula: ${s.scoring_formula}`}>
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      <div class="dashboard-card" style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
        <div>
          <h3>Public Results Page</h3>
          <div class="meta">Status: <span class={`badge ${s.results_published ? 'badge-success' : 'badge-neutral'}`}>{s.results_published ? 'Published' : 'Not Published'}</span></div>
        </div>
        <div style="display:flex; gap:10px;">
          <form method="post" action="/admin/results/recalculate"><button type="submit" class="btn btn-ghost btn-sm">Recalculate Scores</button></form>
          <form method="post" action="/admin/results/publish"><button type="submit" class="btn btn-primary btn-sm">{s.results_published ? 'Unpublish' : 'Publish Results'}</button></form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#127942;</div><h3>No approved projects yet</h3></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Rank</th><th>Project</th><th>Team</th><th>College</th><th>Category</th><th>Evaluations</th><th>Score</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr>
                  <td>{r.final_score != null ? `#${i + 1}` : '—'}</td>
                  <td style="font-weight:600;">{r.title}</td>
                  <td>{r.team_name}</td>
                  <td>{r.college_name}</td>
                  <td>{r.category_name || '—'}</td>
                  <td>{r.eval_count}</td>
                  <td>{r.final_score != null ? Number(r.final_score).toFixed(1) : <span style="color:var(--ink-500);">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
})

adminResults.post('/admin/results/recalculate', async (c) => {
  const user = c.get('user' as never) as any
  const s = await getSettings(c.get('db'))
  const projects = await c.get('db').many<any>(`SELECT p.id FROM projects p JOIN teams t ON t.id=p.team_id WHERE t.status IN ('registered','approved')`)
  for (const p of projects) {
    const score = await computeProjectScore(c.get('db'), p.id, s.scoring_formula)
    await c.get('db').execute('UPDATE projects SET final_score = ? WHERE id = ?', [score, p.id])
  }
  await logAudit(c.get('db'), user.id, 'results_recalculated', 'event', undefined, `${projects.length} projects`)
  return c.redirect('/admin/results?success=' + encodeURIComponent('Scores recalculated.'))
})

adminResults.post('/admin/results/publish', async (c) => {
  const user = c.get('user' as never) as any
  const s = await getSettings(c.get('db'))
  const next = s.results_published ? 0 : 1
  await c.get('db').execute('UPDATE event_settings SET results_published = ?, updated_at = now() WHERE id = 1', [next])
  await logAudit(c.get('db'), user.id, next ? 'results_published' : 'results_unpublished', 'event')
  return c.redirect('/admin/results?success=' + encodeURIComponent(next ? 'Results published.' : 'Results unpublished.'))
})

export default adminResults
