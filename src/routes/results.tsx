import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { getSettings } from '../lib/settings'

const resultsRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

resultsRoutes.get('/results', async (c) => {
  const s = await getSettings(c.get('db'))

  if (!s.results_published) {
    return c.render(
      <SiteLayout title="Results" activePath="/results">
        <section class="section">
          <div class="container-narrow empty-state">
            <div class="icon">&#127942;</div>
            <h3>Results will be announced soon</h3>
            <p>The organizing team is still finalizing evaluations. Check back after the event, or watch the announcements page.</p>
          </div>
        </section>
      </SiteLayout>
    )
  }

  const categoryFilter = c.req.query('category') || ''
  const categories = await c.get('db').many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order')

  const rows = await c.get('db').many<any>(
        `SELECT p.id as project_id, p.title, p.final_score, t.team_name, col.name as college_name, cat.name as category_name, cat.slug as category_slug
         FROM projects p
         JOIN teams t ON t.id = p.team_id
         JOIN colleges col ON col.id = t.college_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         WHERE p.final_score IS NOT NULL AND t.status IN ('registered','approved')
         ORDER BY p.final_score DESC`
        )

  const filtered = categoryFilter ? rows.filter((r) => r.category_slug === categoryFilter) : rows

  return c.render(
    <SiteLayout title="Results" activePath="/results">
      <section class="section">
        <div class="container">
          <div class="breadcrumb"><a href="/">Home</a> / Results</div>
          <div class="section-head">
            <div class="kicker">Final Results</div>
            <h2>Leaderboard</h2>
            <p>Rankings are based on evaluator scores. Category filters help you find results for a specific track.</p>
          </div>
          <div class="toolbar">
            <div class="toolbar-left">
              <a href="/results" class={`btn btn-sm ${!categoryFilter ? 'btn-dark' : 'btn-ghost'}`}>All Categories</a>
              {categories.map((cat) => (
                <a href={`/results?category=${cat.slug}`} class={`btn btn-sm ${categoryFilter === cat.slug ? 'btn-dark' : 'btn-ghost'}`}>{cat.name}</a>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div class="empty-state"><div class="icon">&#127942;</div><h3>No results in this category yet</h3></div>
          ) : (
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>Rank</th><th>Project</th><th>Team</th><th>College</th><th>Category</th><th>Score</th></tr></thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr>
                      <td><span class="badge badge-info">#{i + 1}</span></td>
                      <td><a href={`/projects/${r.project_id}`} style="font-weight:600; color:var(--blue-600);">{r.title}</a></td>
                      <td>{r.team_name}</td>
                      <td>{r.college_name}</td>
                      <td>{r.category_name || '—'}</td>
                      <td style="font-weight:700;">{Number(r.final_score).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  )
})

export default resultsRoutes
