import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'

const adminAudit = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminAudit.use('/admin/audit-log', requireRole('organizer', 'super_admin'))

adminAudit.get('/admin/audit-log', async (c) => {
  const user = c.get('user' as never) as any
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const perPage = 30
  const offset = (page - 1) * perPage

  const total = await c.get('db').one<{ n: number }>('SELECT COUNT(*) as n FROM audit_logs')
  const rows = await c.get('db').many<any>(`SELECT a.*, u.full_name, u.email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ? OFFSET ?`, [perPage, offset])
  const totalPages = Math.max(1, Math.ceil((total?.n || 0) / perPage))

  return c.render(
    <AppShell title="Audit Log" role="organizer" userName={user.full_name} activePath="/admin/audit-log" subtitle="Every important admin action is recorded here.">
      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128220;</div><h3>No audit records yet</h3></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td style="white-space:nowrap;">{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.full_name || 'System'} {r.email ? <span style="color:var(--ink-500); font-size:12px;">({r.email})</span> : ''}</td>
                  <td><span class="badge badge-info">{r.action.replace(/_/g, ' ')}</span></td>
                  <td>{r.target_type ? `${r.target_type} #${r.target_id}` : '—'}</td>
                  <td style="max-width:280px;">{r.details || '—'}</td>
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

export default adminAudit
