import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { sanitizeText } from '../lib/validation'
import { logAudit } from '../lib/audit'

const adminContent = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminContent.use('/admin/announcements', requireRole('organizer', 'super_admin'))
adminContent.use('/admin/announcements/*', requireRole('organizer', 'super_admin'))
adminContent.use('/admin/schedule', requireRole('organizer', 'super_admin'))
adminContent.use('/admin/schedule/*', requireRole('organizer', 'super_admin'))

// ---------------------------------------------------------------- Announcements
adminContent.get('/admin/announcements', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>('SELECT * FROM announcements ORDER BY id DESC')

  return c.render(
    <AppShell title="Announcements" role="organizer" userName={user.full_name} activePath="/admin/announcements">
      <div class="dashboard-card" style="margin-bottom:24px;">
        <h3>New Announcement</h3>
        <form method="post" action="/admin/announcements">
          <div class="field"><label>Title *</label><input name="title" required /></div>
          <div class="field"><label>Message *</label><textarea name="message" required></textarea></div>
          <div class="form-row-2">
            <div class="field"><label>Priority</label>
              <select name="priority"><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select>
            </div>
            <div class="field"><label>Expires (optional)</label><input type="date" name="expires_at" /></div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Publish Announcement</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128276;</div><h3>No announcements yet</h3></div>
      ) : (
        rows.map((a) => (
          <div class="dashboard-card" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between;">
              <h3>{a.title}</h3>
              <span class={`badge ${a.priority === 'urgent' ? 'badge-danger' : a.priority === 'important' ? 'badge-warn' : 'badge-neutral'}`}>{a.priority}</span>
            </div>
            <p>{a.message}</p>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="meta">{new Date(a.published_at).toLocaleString()} {a.is_active ? '' : '(inactive)'}</span>
              <form method="post" action={`/admin/announcements/${a.id}/toggle`}><button class="btn btn-ghost btn-sm" type="submit">{a.is_active ? 'Deactivate' : 'Activate'}</button></form>
            </div>
          </div>
        ))
      )}
    </AppShell>
  )
})

adminContent.post('/admin/announcements', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const title = sanitizeText(body.title as string, 160)
  const message = sanitizeText(body.message as string, 1000)
  const priority = ['normal', 'important', 'urgent'].includes(body.priority as string) ? body.priority as string : 'normal'
  const expiresAt = body.expires_at ? String(body.expires_at) : null
  if (!title || !message) return c.redirect('/admin/announcements')

  await c.get('db').execute('INSERT INTO announcements (title, message, priority, expires_at, created_by) VALUES (?,?,?,?,?)', [title, message, priority, expiresAt, user.id])
  await logAudit(c.get('db'), user.id, 'announcement_published', 'announcement', undefined, title)
  return c.redirect('/admin/announcements')
})

adminContent.post('/admin/announcements/:id/toggle', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const a = await c.get('db').one<any>('SELECT * FROM announcements WHERE id = ?', [id])
  if (!a) return c.notFound()
  await c.get('db').execute('UPDATE announcements SET is_active = ? WHERE id = ?', [a.is_active ? 0 : 1, id])
  await logAudit(c.get('db'), user.id, 'announcement_toggled', 'announcement', id)
  return c.redirect('/admin/announcements')
})

// ---------------------------------------------------------------- Schedule
adminContent.get('/admin/schedule', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>('SELECT * FROM event_schedule ORDER BY sort_order, id')
  const categories = await c.get('db').many<any>('SELECT * FROM categories ORDER BY sort_order')

  return c.render(
    <AppShell title="Schedule" role="organizer" userName={user.full_name} activePath="/admin/schedule">
      <div class="dashboard-card" style="margin-bottom:24px;">
        <h3>Add Schedule Item</h3>
        <p class="hint">Add one item per activity. Use Edit or Remove in the list below to keep the public schedule up to date.</p>
        <form method="post" action="/admin/schedule">
          <div class="form-row-2">
            <div class="field"><label>Time *</label><input name="event_time" required placeholder="e.g. 10:00 AM" /></div>
            <div class="field"><label>Title *</label><input name="title" required /></div>
          </div>
          <div class="field"><label>Description</label><textarea name="description"></textarea></div>
          <div class="form-row-2">
            <div class="field"><label>Location</label><input name="location" /></div>
            <div class="field"><label>Stage / Day</label><input name="stage" placeholder="e.g. Day 1" /></div>
          </div>
          <div class="form-row-2">
            <div class="field"><label>Category (optional)</label>
              <select name="category_id"><option value="">None</option>{categories.map((cat) => <option value={cat.id}>{cat.name}</option>)}</select>
            </div>
            <div class="field"><label>Sort Order</label><input type="number" name="sort_order" value="0" /></div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Add to Schedule</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128197;</div><h3>Schedule is empty</h3></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Time</th><th>Title</th><th>Location</th><th>Stage</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td>{r.event_time}</td>
                  <td style="font-weight:600;">{r.title}</td>
                  <td>{r.location || '—'}</td>
                  <td>{r.stage || '—'}</td>
                  <td>
                    <details>
                      <summary class="btn btn-ghost btn-sm" style="display:inline-block; cursor:pointer;">Edit</summary>
                      <form method="post" action={`/admin/schedule/${r.id}`} style="margin-top:12px; min-width:280px;">
                        <div class="field"><label>Time</label><input name="event_time" value={r.event_time} required /></div>
                        <div class="field"><label>Title</label><input name="title" value={r.title} required /></div>
                        <div class="field"><label>Description</label><textarea name="description">{r.description || ''}</textarea></div>
                        <div class="field"><label>Location</label><input name="location" value={r.location || ''} /></div>
                        <div class="field"><label>Stage / Day</label><input name="stage" value={r.stage || ''} /></div>
                        <div class="form-row-2">
                          <div class="field"><label>Category</label><select name="category_id"><option value="">None</option>{categories.map((cat) => <option value={cat.id} selected={String(r.category_id || '') === String(cat.id)}>{cat.name}</option>)}</select></div>
                          <div class="field"><label>Sort Order</label><input type="number" name="sort_order" value={r.sort_order || 0} /></div>
                        </div>
                        <button class="btn btn-primary btn-sm" type="submit">Save Changes</button>
                      </form>
                    </details>
                    <form method="post" action={`/admin/schedule/${r.id}/delete`} style="display:inline-block; margin-left:6px;"><button class="btn btn-danger btn-sm" type="submit" onclick="return confirm('Remove this schedule item?')">Remove</button></form>
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

adminContent.post('/admin/schedule', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const eventTime = sanitizeText(body.event_time as string, 40)
  const title = sanitizeText(body.title as string, 160)
  const description = sanitizeText(body.description as string, 500)
  const location = sanitizeText(body.location as string, 160)
  const stage = sanitizeText(body.stage as string, 60)
  const categoryId = body.category_id ? parseInt(body.category_id as string, 10) : null
  const sortOrder = parseInt(body.sort_order as string, 10) || 0
  if (!eventTime || !title) return c.redirect('/admin/schedule')

  await c.get('db').execute('INSERT INTO event_schedule (event_time, title, description, location, category_id, stage, sort_order) VALUES (?,?,?,?,?,?,?)', [eventTime, title, description, location, categoryId, stage, sortOrder])
  await logAudit(c.get('db'), user.id, 'schedule_item_added', 'schedule', undefined, title)
  return c.redirect('/admin/schedule')
})

adminContent.post('/admin/schedule/:id', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const eventTime = sanitizeText(body.event_time as string, 40)
  const title = sanitizeText(body.title as string, 160)
  const description = sanitizeText(body.description as string, 500)
  const location = sanitizeText(body.location as string, 160)
  const stage = sanitizeText(body.stage as string, 60)
  const categoryId = body.category_id ? parseInt(body.category_id as string, 10) : null
  const sortOrder = parseInt(body.sort_order as string, 10) || 0
  if (!eventTime || !title) return c.redirect('/admin/schedule')

  await c.get('db').execute('UPDATE event_schedule SET event_time=?, title=?, description=?, location=?, category_id=?, stage=?, sort_order=? WHERE id=?', [eventTime, title, description, location, categoryId, stage, sortOrder, id])
  await logAudit(c.get('db'), user.id, 'schedule_item_updated', 'schedule', id, title)
  return c.redirect('/admin/schedule')
})

adminContent.post('/admin/schedule/:id/delete', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  await c.get('db').execute('DELETE FROM event_schedule WHERE id = ?', [id])
  await logAudit(c.get('db'), user.id, 'schedule_item_removed', 'schedule', id)
  return c.redirect('/admin/schedule')
})

export default adminContent
