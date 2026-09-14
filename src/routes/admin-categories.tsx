import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { sanitizeText } from '../lib/validation'
import { logAudit } from '../lib/audit'

const adminCategories = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminCategories.use('/admin/categories', requireRole('organizer', 'super_admin'))
adminCategories.use('/admin/categories/*', requireRole('organizer', 'super_admin'))

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

adminCategories.get('/admin/categories', async (c) => {
  const user = c.get('user' as never) as any
  const rows = await c.get('db').many<any>('SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.category_id = c.id) as project_count FROM categories c ORDER BY sort_order')

  return c.render(
    <AppShell title="Categories" role="organizer" userName={user.full_name} activePath="/admin/categories">
      <div class="dashboard-card" style="margin-bottom:24px;">
        <h3>Add Category</h3>
        <p class="hint">Categories appear on the registration form and public project pages. Deactivate a category instead of deleting it if projects already use it.</p>
        <form method="post" action="/admin/categories">
          <div class="form-row-2">
            <div class="field"><label>Name *</label><input name="name" required /></div>
            <div class="field"><label>Sort Order</label><input type="number" name="sort_order" value="0" /></div>
          </div>
          <div class="field"><label>Description</label><textarea name="description"></textarea></div>
          <button type="submit" class="btn btn-primary btn-sm">Add Category</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#127991;</div><h3>No categories yet</h3><p>Add your first category above.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Description</th><th>Projects</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((cat) => (
                <tr>
                  <td style="font-weight:600;">{cat.name}</td>
                  <td style="max-width:320px;">{cat.description || '—'}</td>
                  <td>{cat.project_count}</td>
                  <td><span class={`badge ${cat.is_active ? 'badge-success' : 'badge-neutral'}`}>{cat.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <form method="post" action={`/admin/categories/${cat.id}/toggle`} style="display:inline;">
                      <button type="submit" class="btn btn-ghost btn-sm" onclick={cat.is_active ? "return confirm('Hide this category from new registrations? Existing projects will stay unchanged.')" : undefined}>{cat.is_active ? 'Deactivate' : 'Activate'}</button>
                    </form>
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

adminCategories.post('/admin/categories', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const name = sanitizeText(body.name as string, 120)
  const description = sanitizeText(body.description as string, 500)
  const sortOrder = parseInt(body.sort_order as string, 10) || 0
  if (!name) return c.redirect('/admin/categories')
  const slug = slugify(name) + '-' + Date.now().toString(36).slice(-4)
  await c.get('db').execute('INSERT INTO categories (name, slug, description, sort_order) VALUES (?,?,?,?)', [name, slug, description, sortOrder])
  await logAudit(c.get('db'), user.id, 'category_added', 'category', undefined, name)
  return c.redirect('/admin/categories')
})

adminCategories.post('/admin/categories/:id/toggle', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const cat = await c.get('db').one<any>('SELECT * FROM categories WHERE id = ?', [id])
  if (!cat) return c.notFound()
  await c.get('db').execute('UPDATE categories SET is_active = ? WHERE id = ?', [cat.is_active ? 0 : 1, id])
  await logAudit(c.get('db'), user.id, 'category_toggled', 'category', id)
  return c.redirect('/admin/categories')
})

export default adminCategories
