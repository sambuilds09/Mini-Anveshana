import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'

const projectsRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

projectsRoutes.get('/projects', async (c) => {
  const q = c.req.query('q')?.trim() || ''
  const categorySlug = c.req.query('category') || ''
  const collegeId = c.req.query('college') || ''
  const tech = c.req.query('tech')?.trim() || ''
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const perPage = 12

  const categories = await c.get('db').many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order')
  const colleges = await c.get('db').many<any>('SELECT id, name FROM colleges ORDER BY name')

  const conditions = ["p.is_approved_public = 1", "t.status IN ('registered','approved')"]
  const params: any[] = []
  if (q) { conditions.push('(p.title LIKE ? OR t.team_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
  if (categorySlug) { conditions.push('cat.slug = ?'); params.push(categorySlug) }
  if (collegeId) { conditions.push('t.college_id = ?'); params.push(collegeId) }
  if (tech) { conditions.push('p.technologies LIKE ?'); params.push(`%${tech}%`) }
  const whereSql = conditions.join(' AND ')

  const countRow = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM projects p JOIN teams t ON t.id = p.team_id JOIN colleges col ON col.id = t.college_id LEFT JOIN categories cat ON cat.id = p.category_id WHERE ${whereSql}`, params)
  const total = countRow?.n || 0
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const offset = (page - 1) * perPage

  const projects = await c.get('db').many<any>(
      `SELECT p.id, p.title, p.solution_description, p.technologies, t.team_name, col.name as college_name, cat.name as category_name
       FROM projects p
       JOIN teams t ON t.id = p.team_id
       JOIN colleges col ON col.id = t.college_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       WHERE ${whereSql}
       ORDER BY p.submitted_at DESC, p.id DESC
       LIMIT ? OFFSET ?`
    , [...params, perPage, offset])

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (categorySlug) p.set('category', categorySlug)
    if (collegeId) p.set('college', String(collegeId))
    if (tech) p.set('tech', tech)
    Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)))
    return `?${p.toString()}`
  }

  return c.render(
    <SiteLayout title="Project Showcase" activePath="/projects">
      <section class="section">
        <div class="container">
          <div class="breadcrumb"><a href="/">Home</a> / Projects</div>
          <div class="section-head">
            <div class="kicker">Showcase</div>
            <h2>Project Showcase</h2>
            <p>Approved projects from teams across colleges. Explore what students are building for Mini Anveshana.</p>
          </div>

          <form method="get" class="toolbar" role="search" aria-label="Search projects">
            <div class="toolbar-left" style="flex:1;">
              <div class="search-input" style="flex:1; min-width:200px;">
                <input type="search" name="q" placeholder="Search by project or team name" value={q} aria-label="Search projects" />
              </div>
              <select name="category" aria-label="Filter by category">
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option value={cat.slug} selected={cat.slug === categorySlug}>{cat.name}</option>
                ))}
              </select>
              <select name="college" aria-label="Filter by college">
                <option value="">All Colleges</option>
                {colleges.map((col) => (
                  <option value={col.id} selected={String(col.id) === collegeId}>{col.name}</option>
                ))}
              </select>
              <input type="text" name="tech" placeholder="Technology e.g. React" value={tech} style="max-width:180px;" aria-label="Filter by technology" />
            </div>
            <button type="submit" class="btn btn-dark btn-sm">Apply Filters</button>
          </form>

          {projects.length === 0 ? (
            <div class="empty-state">
              <div class="icon">&#128269;</div>
              <h3>No projects match your search</h3>
              <p>Try adjusting your filters, or check back after teams start submitting projects.</p>
            </div>
          ) : (
            <div class="grid-3">
              {projects.map((p) => (
                <div class="card">
                  {p.category_name && <span class="tag">{p.category_name}</span>}
                  <h3 style="font-size:18px;">{p.title}</h3>
                  <p style="font-size:13.5px; color:var(--ink-500); margin-bottom:6px;">{p.team_name} · {p.college_name}</p>
                  <p style="font-size:14px;">{(p.solution_description || '').slice(0, 110)}{(p.solution_description || '').length > 110 ? '…' : ''}</p>
                  <div style="margin:10px 0;">
                    {(p.technologies || '').split(',').filter(Boolean).slice(0, 4).map((t: string) => <span class="tag" style="background:#eef0f5;color:var(--ink-700);">{t.trim()}</span>)}
                  </div>
                  <a href={`/projects/${p.id}`} class="btn btn-ghost btn-sm">View Project &rarr;</a>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div class="pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                n === page ? <span class="current">{n}</span> : <a href={qs({ page: n })}>{n}</a>
              ))}
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  )
})

projectsRoutes.get('/projects/:id', async (c) => {
  const id = c.req.param('id')
  const project = await c.get('db').one<any>(
      `SELECT p.*, t.team_name, t.registration_id, col.name as college_name, cat.name as category_name
       FROM projects p
       JOIN teams t ON t.id = p.team_id
       JOIN colleges col ON col.id = t.college_id
       LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE p.id = ? AND p.is_approved_public = 1 AND t.status IN ('registered','approved')`
    , [id])

  if (!project) {
    c.status(404)
    return c.render(
      <SiteLayout title="Project not found">
        <section class="section"><div class="container-narrow empty-state"><div class="icon">&#128269;</div><h3>This project isn't available</h3><p>It may not be public yet, or the link is incorrect.</p><a href="/projects" class="btn btn-dark" style="margin-top:14px;">Back to Showcase</a></div></section>
      </SiteLayout>
    )
  }

  const members = await c.get('db').many<any>(`SELECT full_name, department, year, is_leader FROM team_members WHERE team_id = (SELECT team_id FROM projects WHERE id = ?) ORDER BY is_leader DESC`, [id])
  const images = await c.get('db').many<any>(`SELECT r2_key, file_name FROM project_files WHERE project_id = ? AND file_type = 'image'`, [id])

  return c.render(
    <SiteLayout title={project.title}>
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / <a href="/projects">Projects</a> / {project.title}</div>
          {project.category_name && <span class="tag">{project.category_name}</span>}
          <h1 style="font-size:32px;">{project.title}</h1>
          <p style="color:var(--ink-500); font-size:14.5px;">{project.team_name} · {project.college_name}</p>

          {images.length > 0 && (
            <div class="grid-3" style="margin:20px 0;">
              {images.map((img) => (
                <img src={`/files/${img.r2_key}`} alt={img.file_name} style="border-radius:12px; border:1px solid var(--line); aspect-ratio:4/3; object-fit:cover;" />
              ))}
            </div>
          )}

          <div class="card" style="margin-bottom:18px;">
            <h3>Problem Statement</h3>
            <p style="margin:0;">{project.problem_statement || 'Not provided.'}</p>
          </div>
          <div class="card" style="margin-bottom:18px;">
            <h3>Our Solution</h3>
            <p style="margin:0;">{project.solution_description || 'Not provided.'}</p>
          </div>
          {project.features && (
            <div class="card" style="margin-bottom:18px;">
              <h3>Key Features</h3>
              <p style="margin:0; white-space:pre-line;">{project.features}</p>
            </div>
          )}

          <div class="grid-2" style="margin-bottom:18px;">
            <div class="card">
              <h3>Technology Used</h3>
              <div>
                {(project.technologies || '').split(',').filter(Boolean).map((t: string) => <span class="tag">{t.trim()}</span>)}
              </div>
            </div>
            <div class="card">
              <h3>Team</h3>
              {members.map((m) => <p style="margin:0 0 6px;">{m.full_name} {m.is_leader ? <span class="badge badge-info">Leader</span> : ''}<br /><span style="font-size:12.5px; color:var(--ink-500);">{m.department} {m.year ? `· Year ${m.year}` : ''}</span></p>)}
            </div>
          </div>

          <div class="hero-actions">
            {project.demo_video_url && <a href={project.demo_video_url} target="_blank" rel="noopener noreferrer" class="btn btn-dark">Watch Demo</a>}
            {project.github_url && <a href={project.github_url} target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="border-color:var(--line); color:var(--ink-900);">View on GitHub</a>}
            <a href="/projects" class="btn btn-ghost">&larr; Back to Showcase</a>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
})

export default projectsRoutes
