import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { statusBadgeClass, fmtStatusLabel } from '../lib/db-helpers'

const adminProjects = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminProjects.use('/admin/projects', requireRole('organizer', 'super_admin'))

adminProjects.get('/admin/projects', async (c) => {
  const user = c.get('user' as never) as any
  const q = c.req.query('q')?.trim() || ''
  const status = c.req.query('status') || ''
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const perPage = 15

  const conditions: string[] = []
  const params: any[] = []
  if (q) { conditions.push('(p.title LIKE ? OR t.team_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
  if (status) { conditions.push('p.status = ?'); params.push(status) }
  const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  const countRow = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM projects p JOIN teams t ON t.id = p.team_id ${whereSql}`, params)
  const total = countRow?.n || 0
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const offset = (page - 1) * perPage

  const rows = await c.get('db').many<any>(
        `SELECT p.id, p.title, p.status, p.is_approved_public, t.team_name, t.registration_id, col.name as college_name, cat.name as category_name,
                (SELECT COUNT(*) FROM evaluator_assignments ea WHERE ea.project_id = p.id) as assigned_count,
                (SELECT COUNT(*) FROM evaluations e WHERE e.project_id = p.id AND e.status='completed') as completed_count
         FROM projects p
         JOIN teams t ON t.id = p.team_id
         JOIN colleges col ON col.id = t.college_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         ${whereSql}
         ORDER BY p.id DESC LIMIT ? OFFSET ?`
        , [...params, perPage, offset])

  return c.render(
    <AppShell title="Projects" role="organizer" userName={user.full_name} activePath="/admin/projects" subtitle={`${total} projects submitted`}>
      <form method="get" class="toolbar">
        <div class="toolbar-left">
          <input type="search" name="q" placeholder="Search project or team" value={q} style="min-width:220px;" />
          <select name="status">
            <option value="">All Status</option>
            {['not_started','draft','submitted','reviewed'].map((st) => <option value={st} selected={st === status}>{fmtStatusLabel(st)}</option>)}
          </select>
          <button class="btn btn-dark btn-sm" type="submit">Filter</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128187;</div><h3>No projects match your search</h3></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Team</th><th>College</th><th>Category</th><th>Status</th><th>Public</th><th>Evaluators</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr>
                  <td style="font-weight:600;">{p.title}</td>
                  <td>{p.team_name} <span style="color:var(--ink-500); font-size:12px;">({p.registration_id})</span></td>
                  <td>{p.college_name}</td>
                  <td>{p.category_name || '—'}</td>
                  <td><span class={`badge ${statusBadgeClass(p.status)}`}>{fmtStatusLabel(p.status)}</span></td>
                  <td><span class={`badge ${p.is_approved_public ? 'badge-success' : 'badge-neutral'}`}>{p.is_approved_public ? 'Public' : 'Hidden'}</span></td>
                  <td>{p.completed_count}/{p.assigned_count}</td>
                  <td>
                    <a href={`/projects/${p.id}`} class="btn btn-ghost btn-sm" target="_blank" rel="noopener">Public View</a>
                    <a href={`/admin/evaluators?project=${p.id}`} class="btn btn-ghost btn-sm">Assign</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div class="pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            n === page ? <span class="current">{n}</span> : <a href={`?page=${n}`}>{n}</a>
          ))}
        </div>
      )}
    </AppShell>
  )
})

export default adminProjects
