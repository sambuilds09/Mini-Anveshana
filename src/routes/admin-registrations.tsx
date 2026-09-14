import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { statusBadgeClass, fmtStatusLabel } from '../lib/db-helpers'
import { logAudit } from '../lib/audit'
import { sanitizeText } from '../lib/validation'
import { getStorage } from '../lib/storage'

const adminReg = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminReg.use('/admin/registrations/*', requireRole('organizer', 'super_admin'))
adminReg.use('/admin/registrations', requireRole('organizer', 'super_admin'))
adminReg.use('/admin/projects/*', requireRole('organizer', 'super_admin'))
adminReg.use('/admin/files/*', requireRole('organizer', 'super_admin'))

adminReg.get('/admin/registrations', async (c) => {
  const user = c.get('user' as never) as any
  const db = c.get('db')
  const q = c.req.query('q')?.trim() || ''
  const status = c.req.query('status') || ''
  const collegeId = c.req.query('college') || ''
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const perPage = 15

  const conditions: string[] = []
  const params: any[] = []
  if (q) { conditions.push('(t.team_name LIKE ? OR t.registration_id LIKE ? OR t.leader_email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  if (status) { conditions.push('t.status = ?'); params.push(status) }
  if (collegeId) { conditions.push('t.college_id = ?'); params.push(collegeId) }
  const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  const countRow = await db.one<{ n: number }>(`SELECT COUNT(*) as n FROM teams t ${whereSql}`, params)
  const total = countRow?.n || 0
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const offset = (page - 1) * perPage

  const rows = await db.many<any>(
        `SELECT t.id, t.registration_id, t.team_name, t.status, t.checked_in, col.name as college_name,
                p.id as project_id, p.title as project_title, p.status as project_status, cat.name as category_name,
                (SELECT COUNT(*) FROM evaluations e WHERE e.project_id = p.id AND e.status='completed') as eval_count
         FROM teams t
         JOIN colleges col ON col.id = t.college_id
         LEFT JOIN projects p ON p.team_id = t.id
         LEFT JOIN categories cat ON cat.id = p.category_id
         ${whereSql}
         ORDER BY t.id DESC LIMIT ? OFFSET ?`
        , [...params, perPage, offset])

  const colleges = await db.many<any>('SELECT id, name FROM colleges ORDER BY name')

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status) p.set('status', status)
    if (collegeId) p.set('college', collegeId)
    Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)))
    return `?${p.toString()}`
  }

  return c.render(
    <AppShell title="Registrations" role="organizer" userName={user.full_name} activePath="/admin/registrations" subtitle={`${total} total registrations`}>
      <form method="get" class="toolbar">
        <div class="toolbar-left" style="flex:1;">
          <input type="search" name="q" placeholder="Search team, ID, or email" value={q} style="min-width:220px;" />
          <select name="college">
            <option value="">All Colleges</option>
            {colleges.map((col) => <option value={col.id} selected={String(col.id) === collegeId}>{col.name}</option>)}
          </select>
          <button class="btn btn-dark btn-sm" type="submit">Filter</button>
        </div>
        <a href={`/admin/registrations/export.csv${qs({})}`} class="btn btn-ghost btn-sm">Export CSV</a>
      </form>

      <div>
        {rows.length === 0 ? (
          <div class="empty-state"><div class="icon">&#128203;</div><h3>No registrations match your search</h3><p>Try adjusting your filters.</p></div>
        ) : (
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th><input type="checkbox" id="select-all" /></th>
                  <th>Reg. ID</th><th>Team</th><th>College</th><th>Category</th><th>Project</th><th>Status</th><th>Check-in</th><th>Evaluation</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr>
                    <td><input type="checkbox" name="team_ids" value={t.id} class="row-check" /></td>
                    <td style="font-weight:600;">{t.registration_id}</td>
                    <td>{t.team_name}</td>
                    <td>{t.college_name}</td>
                    <td>{t.category_name || '—'}</td>
                    <td>{t.project_title || <span style="color:var(--ink-500);">No project</span>}</td>
                    <td><span class={`badge ${statusBadgeClass(t.status)}`}>{fmtStatusLabel(t.status)}</span></td>
                    <td><span class={`badge ${t.checked_in ? 'badge-success' : 'badge-neutral'}`}>{t.checked_in ? 'Checked In' : 'Not Checked In'}</span></td>
                    <td>{t.eval_count > 0 ? <span class="badge badge-success">{t.eval_count} done</span> : <span class="badge badge-neutral">None</span>}</td>
                    <td><a href={`/admin/registrations/${t.id}`} class="btn btn-ghost btn-sm">View</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div class="pagination">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            n === page ? <span class="current">{n}</span> : <a href={qs({ page: n })}>{n}</a>
          ))}
        </div>
      )}

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('select-all')?.addEventListener('change', function(e){
          document.querySelectorAll('.row-check').forEach(function(cb){ cb.checked = e.target.checked; });
        });
      `}}></script>
    </AppShell>
  )
})

adminReg.get('/admin/registrations/export.csv', async (c) => {
  const rows = await c.get('db').many<any>(`SELECT t.registration_id, t.team_name, col.name as college_name, t.status, t.checked_in, t.leader_name, t.leader_email FROM teams t JOIN colleges col ON col.id = t.college_id ORDER BY t.id`)
  const header = 'Registration ID,Team Name,College,Status,Checked In,Leader Name,Leader Email\n'
  const csv = header + rows.map((r) => [r.registration_id, r.team_name, r.college_name, r.status, r.checked_in ? 'Yes' : 'No', r.leader_name, r.leader_email].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="registrations.csv"' } })
})

adminReg.post('/admin/registrations/bulk', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody({ all: true })
  const action = body.bulk_action as string
  const ids = ([] as string[]).concat((body.team_ids as any) || [])
  if (!action || ids.length === 0) return c.redirect('/admin/registrations')

  for (const id of ids) {
    if (action === 'approve') {
      await c.get('db').execute(`UPDATE teams SET status='approved', updated_at=now() WHERE id = ?`, [id])
      await logAudit(c.get('db'), user.id, 'registration_approved', 'team', id, 'Bulk approve')
    } else if (action === 'reject') {
      await c.get('db').execute(`UPDATE teams SET status='rejected', updated_at=now() WHERE id = ?`, [id])
      await logAudit(c.get('db'), user.id, 'registration_rejected', 'team', id, 'Bulk reject')
    }
  }
  return c.redirect('/admin/registrations')
})

adminReg.get('/admin/registrations/:id', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const team = await c.get('db').one<any>(`SELECT t.*, col.name as college_name FROM teams t JOIN colleges col ON col.id = t.college_id WHERE t.id = ?`, [id])
  if (!team) return c.notFound()

  const members = await c.get('db').many<any>('SELECT * FROM team_members WHERE team_id = ? ORDER BY is_leader DESC', [id])
  const mentor = await c.get('db').one<any>('SELECT * FROM faculty_coordinators WHERE team_id = ?', [id])
  const project = await c.get('db').one<any>('SELECT p.*, cat.name as category_name FROM projects p LEFT JOIN categories cat ON cat.id=p.category_id WHERE team_id = ?', [id])
  const files = project ? await c.get('db').many<any>('SELECT * FROM project_files WHERE project_id = ?', [project.id]) : []

  return c.render(
    <AppShell title={`Registration ${team.registration_id}`} role="organizer" userName={user.full_name} activePath="/admin/registrations">
      <div class="breadcrumb"><a href="/admin/registrations">Registrations</a> / {team.registration_id}</div>

      <div class="grid-2" style="align-items:flex-start; margin-bottom:20px;">
        <div class="dashboard-card">
          <h3>{team.team_name}</h3>
          <div class="meta">{team.college_name}</div>
          <span class={`badge ${statusBadgeClass(team.status)}`}>{fmtStatusLabel(team.status)}</span>
          {team.rejection_reason && <p style="font-size:13px; color:var(--danger); margin-top:8px;">Reason: {team.rejection_reason}</p>}

          <h4 style="margin-top:18px; font-size:14px;">Members</h4>
          {members.map((m) => <p style="margin:0 0 6px; font-size:13.5px;">{m.full_name} {m.is_leader && <span class="badge badge-info">Leader</span>}<br /><span style="color:var(--ink-500);">{m.email} · {m.usn} · {m.department} · {m.year}</span></p>)}

          {mentor && (
            <div>
              <h4 style="margin-top:18px; font-size:14px;">Faculty Mentor</h4>
              <p style="margin:0; font-size:13.5px;">{mentor.name} — {mentor.department}<br /><span style="color:var(--ink-500);">{mentor.email} · {mentor.phone}</span></p>
            </div>
          )}
        </div>

        <div>
          <div class="dashboard-card" style="margin-bottom:16px;">
            <h3>Review Decision</h3>
            <form method="post" action={`/admin/registrations/${id}/decision`}>
              <div class="field"><label>Rejection reason (required if rejecting)</label><textarea name="reason" placeholder="Explain why, if rejecting"></textarea></div>
              <div style="display:flex; gap:10px;">
                <button type="submit" name="decision" value="approved" class="btn btn-primary btn-sm">Approve</button>
                <button type="submit" name="decision" value="rejected" class="btn btn-danger btn-sm">Reject</button>
                <button type="submit" name="decision" value="under_review" class="btn btn-ghost btn-sm">Mark Under Review</button>
              </div>
            </form>
          </div>

          {project && (
            <div class="dashboard-card">
              <h3>{project.title}</h3>
              <div class="meta">{project.category_name} · <span class={`badge ${statusBadgeClass(project.status)}`}>{fmtStatusLabel(project.status)}</span></div>
              <p style="font-size:13.5px;"><strong>Problem:</strong> {project.problem_statement}</p>
              <p style="font-size:13.5px;"><strong>Solution:</strong> {project.solution_description}</p>
              <div>{(project.technologies || '').split(',').filter(Boolean).map((t: string) => <span class="tag">{t.trim()}</span>)}</div>
              {files.length > 0 && (
                <div style="margin-top:10px;">
                  <h4 style="font-size:13px;">Files</h4>
                  {files.map((f) => <a href={`/admin/files/${encodeURIComponent(f.r2_key)}`} class="btn btn-ghost btn-sm" style="margin:0 6px 6px 0;">{f.file_type}: {f.file_name}</a>)}
                </div>
              )}
              <div style="margin-top:12px;">
                <label style="font-size:13px; font-weight:600; display:flex; align-items:center; gap:8px;">
                  <form method="post" action={`/admin/projects/${project.id}/toggle-public`} style="display:inline;">
                    <button type="submit" class={`btn btn-sm ${project.is_approved_public ? 'btn-dark' : 'btn-ghost'}`}>{project.is_approved_public ? 'Public on Showcase ✓' : 'Publish to Showcase'}</button>
                  </form>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
})

adminReg.post('/admin/registrations/:id/decision', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const decision = body.decision as string
  const reason = sanitizeText(body.reason as string, 500)
  if (!['approved', 'rejected', 'under_review'].includes(decision)) return c.redirect(`/admin/registrations/${id}`)
  if (decision === 'rejected' && !reason) return c.redirect(`/admin/registrations/${id}`)

  await c.get('db').execute(`UPDATE teams SET status = ?, rejection_reason = ?, updated_at = now() WHERE id = ?`, [decision, decision === 'rejected' ? reason : null, id])
  await logAudit(c.get('db'), user.id, `registration_${decision}`, 'team', id, reason || undefined)
  return c.redirect(`/admin/registrations/${id}`)
})

adminReg.post('/admin/projects/:id/toggle-public', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const project = await c.get('db').one<any>('SELECT * FROM projects WHERE id = ?', [id])
  if (!project) return c.notFound()
  await c.get('db').execute('UPDATE projects SET is_approved_public = ? WHERE id = ?', [project.is_approved_public ? 0 : 1, id])
  await logAudit(c.get('db'), user.id, 'project_publish_toggled', 'project', id)
  const team = await c.get('db').one<any>('SELECT id FROM teams WHERE id = ?', [project.team_id])
  return c.redirect(`/admin/registrations/${team.id}`)
})

// Authenticated file download for organizers (abstracts/presentations may be private)
adminReg.get('/admin/files/:key{.+}', async (c) => {
  const key = decodeURIComponent(c.req.param('key'))
  const record = await c.get('db').one<any>('SELECT file_name, content_type FROM project_files WHERE r2_key = ?', [key])
  if (!record) return c.notFound()
  const obj = await getStorage(c.env).download(key)
  if (!obj) return c.notFound()
  const safeFileName = String(record.file_name || key.split('/').pop() || 'download').replace(/["\r\n]/g, '_')
  return new Response(obj.body, { headers: { 'Content-Type': record.content_type || obj.contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${safeFileName}"` } })
})

export default adminReg
