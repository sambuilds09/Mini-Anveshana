import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { logAudit } from '../lib/audit'

const adminTeams = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminTeams.use('/admin/teams', requireRole('organizer', 'super_admin'))
adminTeams.use('/admin/teams/*', requireRole('organizer', 'super_admin'))

function csv(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

async function teamRows(db: any, search = '', categoryId = '') {
  const conditions: string[] = []
  const params: any[] = []
  if (search) {
    conditions.push('(t.registration_id ILIKE ? OR col.name ILIKE ? OR t.leader_name ILIKE ? OR p.title ILIKE ? OR cat.name ILIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (categoryId) {
    conditions.push('(t.category_id = ? OR p.category_id = ?)')
    params.push(parseInt(categoryId, 10), parseInt(categoryId, 10))
  }
  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.many<any>(
    `SELECT t.id, t.registration_id, t.department, t.leader_name, t.created_at, col.name AS college_name,
            COALESCE(cat.name, pcat.name) AS category_name, p.title AS project_title, t.status,
            COALESCE(string_agg(CASE WHEN m.is_leader = 0 THEN m.full_name END, ', ' ORDER BY m.id), '') AS member_names
     FROM teams t
     JOIN colleges col ON col.id = t.college_id
     LEFT JOIN categories cat ON cat.id = t.category_id
     LEFT JOIN projects p ON p.team_id = t.id
     LEFT JOIN categories pcat ON pcat.id = p.category_id
     LEFT JOIN team_members m ON m.team_id = t.id
     ${whereSql}
     GROUP BY t.id, col.name, cat.name, pcat.name, p.title
     ORDER BY t.id DESC`, params)
}

adminTeams.get('/admin/teams', async (c) => {
  const user = c.get('user' as never) as any
  const search = c.req.query('q')?.trim() || ''
  const selectedCategory = c.req.query('category')?.trim() || ''
  const categories = await c.get('db').many<any>('SELECT * FROM categories ORDER BY sort_order, name')
  const rows = await teamRows(c.get('db'), search, selectedCategory)
  return c.render(
    <AppShell title="Teams" role="organizer" userName={user.full_name} activePath="/admin/teams" subtitle={`${rows.length} registered teams`}>
      <div class="toolbar">
        <form method="get" class="toolbar-left" style="flex:1;">
          <input type="search" name="q" value={search} placeholder="Search team ID, college, leader, or project" style="min-width:260px;" />
          <select name="category" onchange="this.form.submit()" style="max-width:200px;">
            <option value="">All Categories</option>
            {categories.map((cat: any) => (
              <option value={cat.id} selected={selectedCategory === String(cat.id)}>{cat.name}</option>
            ))}
          </select>
          <button class="btn btn-dark btn-sm" type="submit">Filter</button>
          {(search || selectedCategory) && <a href="/admin/teams" class="btn btn-ghost btn-sm">Clear</a>}
        </form>
        <a href={`/admin/teams/export.csv?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(selectedCategory ? { category: selectedCategory } : {}) }).toString()}`} class="btn btn-primary btn-sm">Download Teams CSV</a>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Team ID</th><th>Category</th><th>College</th><th>Department</th><th>Team Leader</th><th>Team Members</th><th>Project</th><th>Registered</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colspan={10}>No teams found.</td></tr> : rows.map((row) => (
            <tr>
              <td style="font-weight:700;">{row.registration_id}</td><td><span class="tag">{row.category_name || '—'}</span></td><td>{row.college_name}</td><td>{row.department || '—'}</td><td>{row.leader_name}</td><td>{row.member_names || '—'}</td><td>{row.project_title || '—'}</td><td>{new Date(row.created_at).toLocaleDateString()}</td><td><span class="badge badge-success">Registered</span></td>
              <td><a href={`/admin/registrations/${row.id}`} class="btn btn-ghost btn-sm">View Team</a> <a href={`/registration/pass?id=${encodeURIComponent(row.registration_id)}`} class="btn btn-ghost btn-sm">View QR</a></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </AppShell>
  )
})

adminTeams.get('/admin/teams/export.csv', async (c) => {
  const user = c.get('user' as never) as any
  const search = c.req.query('q')?.trim() || ''
  const category = c.req.query('category')?.trim() || ''
  const rows = await teamRows(c.get('db'), search, category)
  const lines = [
    ['Team ID', 'Category', 'College Name', 'Department', 'Team Leader', 'Member 2', 'Member 3', 'Member 4', 'Project Title', 'Registration Date', 'Status'].map(csv).join(','),
    ...rows.map((row) => {
      const members = String(row.member_names || '').split(',').map((value: string) => value.trim()).filter(Boolean)
      return [row.registration_id, row.category_name || '—', row.college_name, row.department, row.leader_name, members[0], members[1], members[2], row.project_title, row.created_at, 'REGISTERED'].map(csv).join(',')
    }),
  ]
  await logAudit(c.get('db'), user.id, 'teams_csv_exported', 'team', undefined, `Exported ${rows.length} teams`)
  return new Response(`\uFEFF${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="mini-anveshana-teams.csv"' } })
})

export default adminTeams
