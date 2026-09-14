import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { statusBadgeClass, fmtStatusLabel } from '../lib/db-helpers'
import { logAudit } from '../lib/audit'

const adminEvaluations = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminEvaluations.use('/admin/evaluations', requireRole('organizer', 'super_admin'))
adminEvaluations.use('/admin/evaluations/*', requireRole('organizer', 'super_admin'))

adminEvaluations.get('/admin/evaluations', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>(
        `SELECT e.id, e.status, e.total_score, e.submitted_at, p.id as project_id, p.title as project_title, t.team_name, u.full_name as evaluator_name
         FROM evaluations e
         JOIN projects p ON p.id = e.project_id
         JOIN teams t ON t.id = p.team_id
         JOIN evaluators ev ON ev.id = e.evaluator_id
         JOIN users u ON u.id = ev.user_id
         ORDER BY p.title, u.full_name`
        )

  return c.render(
    <AppShell title="Evaluations" role="organizer" userName={user.full_name} activePath="/admin/evaluations" subtitle="All evaluator scores across every assigned project.">
      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#9878;</div><h3>No evaluations assigned yet</h3><p>Assign evaluators to projects from the Evaluators page.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Team</th><th>Evaluator</th><th>Score</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td style="font-weight:600;">{r.project_title}</td>
                  <td>{r.team_name}</td>
                  <td>{r.evaluator_name}</td>
                  <td>{r.total_score != null ? `${Number(r.total_score).toFixed(1)}/100` : '—'}</td>
                  <td><span class={`badge ${statusBadgeClass(r.status)}`}>{fmtStatusLabel(r.status)}</span></td>
                  <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
                  <td>
                    {r.status === 'completed' && (
                      <form method="post" action={`/admin/evaluations/${r.id}/reopen`} style="display:inline;">
                        <button type="submit" class="btn btn-ghost btn-sm" onclick="return confirm('Reopen this evaluation for editing?')">Reopen</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
})

adminEvaluations.post('/admin/evaluations/:id/reopen', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  await c.get('db').execute(`UPDATE evaluations SET status='in_progress', reopened_at=now() WHERE id = ?`, [id])
  await logAudit(c.get('db'), user.id, 'evaluation_reopened', 'evaluation', id)
  return c.redirect('/admin/evaluations')
})

export default adminEvaluations
