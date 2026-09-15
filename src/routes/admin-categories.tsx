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
  const error = c.req.query('error')
  const success = c.req.query('success')
  const editId = c.req.query('edit')
  const rows = await c.get('db').many<any>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM projects p WHERE p.category_id = c.id) +
            (SELECT COUNT(*) FROM teams t WHERE t.category_id = c.id) as item_count
     FROM categories c ORDER BY sort_order, id`
  )
  const editingCategory = editId ? rows.find((r) => String(r.id) === String(editId)) : null

  return c.render(
    <AppShell title="Categories" role="organizer" userName={user.full_name} activePath="/admin/categories">
      {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      <div class="dashboard-card" style="margin-bottom:24px;">
        <h3>{editingCategory ? `Edit Category: ${editingCategory.name}` : 'Add Category'}</h3>
        <p class="hint">Categories appear on the registration form and public project pages. Deactivate a category instead of deleting it if teams or projects are assigned to it.</p>
        <form method="post" action={editingCategory ? `/admin/categories/${editingCategory.id}/edit` : '/admin/categories'}>
          <div class="form-row-2">
            <div class="field"><label>Category Name *</label><input name="name" value={editingCategory?.name || ''} required maxLength={120} /></div>
            <div class="field"><label>Display Order</label><input type="number" name="sort_order" value={editingCategory?.sort_order ?? 0} /></div>
          </div>
          <div class="field"><label>Description (optional)</label><textarea name="description">{editingCategory?.description || ''}</textarea></div>
          <div style="display:flex; gap:10px;">
            <button type="submit" class="btn btn-primary btn-sm">{editingCategory ? 'Update Category' : 'Add Category'}</button>
            {editingCategory && <a href="/admin/categories" class="btn btn-ghost btn-sm">Cancel Edit</a>}
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#127991;</div><h3>No categories yet</h3><p>Add your first category above.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Description</th><th>Display Order</th><th>Assigned Teams/Projects</th><th>Created At</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((cat) => (
                <tr>
                  <td style="font-weight:600;">{cat.name}</td>
                  <td style="max-width:280px;">{cat.description || '—'}</td>
                  <td>{cat.sort_order}</td>
                  <td>{cat.item_count}</td>
                  <td>{new Date(cat.created_at).toLocaleDateString()}</td>
                  <td><span class={`badge ${cat.is_active ? 'badge-success' : 'badge-neutral'}`}>{cat.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      <a href={`/admin/categories?edit=${cat.id}`} class="btn btn-ghost btn-sm">Edit</a>
                      <form method="post" action={`/admin/categories/${cat.id}/toggle`} style="display:inline;">
                        <button type="submit" class="btn btn-ghost btn-sm" onclick={cat.is_active ? "return confirm('Hide this category from new registrations? Existing teams will stay unchanged.')" : undefined}>{cat.is_active ? 'Deactivate' : 'Activate'}</button>
                      </form>
                      {cat.item_count === 0 && (
                        <form method="post" action={`/admin/categories/${cat.id}/delete`} style="display:inline;">
                          <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Delete this category permanently?')">Delete</button>
                        </form>
                      )}
                    </div>
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
  if (!name) return c.redirect('/admin/categories?error=' + encodeURIComponent('Category name is required.'))
  const slug = slugify(name) + '-' + Date.now().toString(36).slice(-4)
  await c.get('db').execute('INSERT INTO categories (name, slug, description, sort_order, is_active) VALUES (?,?,?,?,1)', [name, slug, description, sortOrder])
  await logAudit(c.get('db'), user.id, 'category_added', 'category', undefined, name)
  return c.redirect('/admin/categories?success=' + encodeURIComponent(`Category "${name}" created successfully.`))
})

adminCategories.post('/admin/categories/:id/edit', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const name = sanitizeText(body.name as string, 120)
  const description = sanitizeText(body.description as string, 500)
  const sortOrder = parseInt(body.sort_order as string, 10) || 0
  if (!name) return c.redirect('/admin/categories?error=' + encodeURIComponent('Category name is required.'))

  const existing = await c.get('db').one<any>('SELECT * FROM categories WHERE id = ?', [id])
  if (!existing) return c.notFound()

  await c.get('db').execute('UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?', [name, description, sortOrder, id])
  await logAudit(c.get('db'), user.id, 'category_updated', 'category', id, name)
  return c.redirect('/admin/categories?success=' + encodeURIComponent(`Category "${name}" updated successfully.`))
})

adminCategories.post('/admin/categories/:id/toggle', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const cat = await c.get('db').one<any>('SELECT * FROM categories WHERE id = ?', [id])
  if (!cat) return c.notFound()
  await c.get('db').execute('UPDATE categories SET is_active = ? WHERE id = ?', [cat.is_active ? 0 : 1, id])
  await logAudit(c.get('db'), user.id, 'category_toggled', 'category', id, `Status: ${cat.is_active ? 'Inactive' : 'Active'}`)
  return c.redirect('/admin/categories?success=' + encodeURIComponent(`Category status updated.`))
})

adminCategories.post('/admin/categories/:id/delete', async (c) => {
  const user = c.get('user' as never) as any
  const id = c.req.param('id')
  const cat = await c.get('db').one<any>('SELECT * FROM categories WHERE id = ?', [id])
  if (!cat) return c.notFound()

  const teamCount = await c.get('db').one<{ n: number }>('SELECT COUNT(*) as n FROM teams WHERE category_id = ?', [id])
  const projCount = await c.get('db').one<{ n: number }>('SELECT COUNT(*) as n FROM projects WHERE category_id = ?', [id])
  if ((teamCount?.n || 0) > 0 || (projCount?.n || 0) > 0) {
    return c.redirect('/admin/categories?error=' + encodeURIComponent('Cannot delete category: teams or projects are currently assigned to it. Deactivate it instead.'))
  }

  await c.get('db').execute('DELETE FROM categories WHERE id = ?', [id])
  await logAudit(c.get('db'), user.id, 'category_deleted', 'category', id, cat.name)
  return c.redirect('/admin/categories?success=' + encodeURIComponent(`Category "${cat.name}" deleted.`))
})

export default adminCategories
