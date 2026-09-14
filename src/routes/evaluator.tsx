import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { statusBadgeClass, fmtStatusLabel } from '../lib/db-helpers'
import { sanitizeText } from '../lib/validation'
import { logAudit } from '../lib/audit'
import type { PostgresDatabase } from '../lib/db'

const evaluatorRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()
evaluatorRoutes.use('/evaluator/dashboard', requireRole('evaluator'))
evaluatorRoutes.use('/evaluator/projects', requireRole('evaluator'))
evaluatorRoutes.use('/evaluator/projects/*', requireRole('evaluator'))

async function getEvaluatorId(db: PostgresDatabase, userId: number): Promise<number | null> {
  const row = await db.one<{ id: number }>('SELECT id FROM evaluators WHERE user_id = ?', [userId])
  return row?.id ?? null
}

evaluatorRoutes.get('/evaluator/dashboard', async (c) => {
  const user = c.get('user' as never) as any
  const evaluatorId = await getEvaluatorId(c.get('db'), user.id)
  if (!evaluatorId) return c.render(<AppShell title="Dashboard" role="evaluator" userName={user.full_name} activePath="/evaluator/dashboard"><div class="empty-state"><div class="icon">&#9878;</div><h3>Evaluator profile not found</h3></div></AppShell>)

  const assigned = await c.get('db').one<{ n: number }>('SELECT COUNT(*) as n FROM evaluator_assignments WHERE evaluator_id = ?', [evaluatorId])
  const pending = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM evaluations WHERE evaluator_id = ? AND status != 'completed'`, [evaluatorId])
  const completed = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM evaluations WHERE evaluator_id = ? AND status = 'completed'`, [evaluatorId])

  return c.render(
    <AppShell title="Evaluator Dashboard" role="evaluator" userName={user.full_name} activePath="/evaluator/dashboard">
      <div class="grid-3" style="margin-bottom:24px;">
        <div class="stat-card"><div class="label">Assigned Projects</div><div class="value">{assigned?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Pending Evaluations</div><div class="value">{pending?.n || 0}</div></div>
        <div class="stat-card"><div class="label">Completed Evaluations</div><div class="value">{completed?.n || 0}</div></div>
      </div>
      <a href="/evaluator/projects" class="btn btn-dark">View Assigned Projects &rarr;</a>
    </AppShell>
  )
})

evaluatorRoutes.get('/evaluator/projects', async (c) => {
  const user = c.get('user' as never) as any
  const evaluatorId = await getEvaluatorId(c.get('db'), user.id)
  if (!evaluatorId) return c.redirect('/evaluator/dashboard')

  const rows = await c.get('db').many<any>(
        `SELECT e.id as evaluation_id, e.status, e.total_score, p.id as project_id, p.title, t.team_name, col.name as college_name, cat.name as category_name
         FROM evaluations e
         JOIN projects p ON p.id = e.project_id
         JOIN teams t ON t.id = p.team_id
         JOIN colleges col ON col.id = t.college_id
         LEFT JOIN categories cat ON cat.id = p.category_id
         WHERE e.evaluator_id = ?
         ORDER BY (e.status = 'completed'), p.title`
        , [evaluatorId])

  return c.render(
    <AppShell title="Assigned Projects" role="evaluator" userName={user.full_name} activePath="/evaluator/projects">
      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#128203;</div><h3>No evaluations assigned</h3><p>Once the organizing team assigns projects to you, they'll appear here.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Project</th><th>Team</th><th>College</th><th>Category</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td style="font-weight:600;">{r.title}</td>
                  <td>{r.team_name}</td>
                  <td>{r.college_name}</td>
                  <td>{r.category_name || '—'}</td>
                  <td><span class={`badge ${statusBadgeClass(r.status)}`}>{fmtStatusLabel(r.status)}</span></td>
                  <td>{r.total_score != null ? `${Number(r.total_score).toFixed(1)}/100` : '—'}</td>
                  <td><a href={`/evaluator/projects/${r.project_id}/evaluate`} class="btn btn-primary btn-sm">{r.status === 'completed' ? 'View' : 'Evaluate'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
})

evaluatorRoutes.get('/evaluator/projects/:id/evaluate', async (c) => {
  const user = c.get('user' as never) as any
  const evaluatorId = await getEvaluatorId(c.get('db'), user.id)
  const projectId = c.req.param('id')
  if (!evaluatorId) return c.redirect('/evaluator/dashboard')

  const evaluation = await c.get('db').one<any>('SELECT * FROM evaluations WHERE evaluator_id = ? AND project_id = ?', [evaluatorId, projectId])
  if (!evaluation) {
    c.status(403)
    return c.render(<AppShell title="Not Assigned" role="evaluator" userName={user.full_name} activePath="/evaluator/projects"><div class="empty-state"><div class="icon">&#128274;</div><h3>You are not assigned to this project</h3></div></AppShell>)
  }

  const project = await c.get('db').one<any>(`SELECT p.*, t.team_name, col.name as college_name, cat.name as category_name FROM projects p JOIN teams t ON t.id=p.team_id JOIN colleges col ON col.id=t.college_id LEFT JOIN categories cat ON cat.id=p.category_id WHERE p.id = ?`, [projectId])
  const criteria = await c.get('db').many<any>('SELECT * FROM evaluation_criteria WHERE is_active = 1 ORDER BY sort_order')
  const existingScores = await c.get('db').many<any>('SELECT * FROM evaluation_scores WHERE evaluation_id = ?', [evaluation.id])
  const scoreMap = new Map(existingScores.map((s: any) => [s.criterion_id, s.score]))
  const locked = evaluation.status === 'completed'
  const success = c.req.query('success')

  return c.render(
    <AppShell title={project.title} role="evaluator" userName={user.full_name} activePath="/evaluator/projects">
      <div class="breadcrumb"><a href="/evaluator/projects">Assigned Projects</a> / {project.title}</div>
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}
      {locked && <div class="alert alert-info">This evaluation has been submitted and is locked. Contact the organizer if it needs to be reopened.</div>}

      <div class="grid-2" style="align-items:flex-start;">
        <div class="dashboard-card">
          <h3>{project.title}</h3>
          <div class="meta">{project.team_name} · {project.college_name} · {project.category_name}</div>
          <p style="font-size:13.5px;"><strong>Problem:</strong> {project.problem_statement}</p>
          <p style="font-size:13.5px;"><strong>Solution:</strong> {project.solution_description}</p>
          {project.features && <p style="font-size:13.5px;"><strong>Features:</strong> {project.features}</p>}
          <div>{(project.technologies || '').split(',').filter(Boolean).map((t: string) => <span class="tag">{t.trim()}</span>)}</div>
          {project.demo_video_url && <p style="margin-top:10px;"><a href={project.demo_video_url} target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">Watch Demo</a></p>}
          {project.github_url && <p><a href={project.github_url} target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">View GitHub</a></p>}
        </div>

        <div class="dashboard-card">
          <h3>Scoring</h3>
          <form method="post" action={`/evaluator/projects/${projectId}/evaluate`}>
            {criteria.map((cr) => (
              <div class="field">
                <div class="score-slider-label"><span>{cr.name} <span style="color:var(--ink-500); font-weight:400;">({cr.description})</span></span><span id={`val-${cr.id}`}>{scoreMap.get(cr.id) ?? 0}/{cr.max_score}</span></div>
                <input type="range" name={`score_${cr.id}`} min="0" max={cr.max_score} value={scoreMap.get(cr.id) ?? 0} disabled={locked}
                  oninput={`document.getElementById('val-${cr.id}').textContent = this.value + '/${cr.max_score}'; recalcTotal();`} />
              </div>
            ))}
            <div class="criteria-total"><span>Total Score</span><span class="num" id="total-score">{evaluation.total_score != null ? Number(evaluation.total_score).toFixed(0) : 0}</span></div>

            <div class="field" style="margin-top:16px;"><label>Strengths</label><textarea name="strengths" disabled={locked}>{evaluation.strengths || ''}</textarea></div>
            <div class="field"><label>Suggestions for Improvement</label><textarea name="suggestions" disabled={locked}>{evaluation.suggestions || ''}</textarea></div>
            <div class="field"><label>General Comments</label><textarea name="comments" disabled={locked}>{evaluation.comments || ''}</textarea></div>

            {!locked && <button type="submit" class="btn btn-primary btn-block">Submit Evaluation</button>}
          </form>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        function recalcTotal(){
          var inputs = document.querySelectorAll('input[type=range]');
          var total = 0;
          inputs.forEach(function(i){ total += parseFloat(i.value || 0); });
          var el = document.getElementById('total-score');
          if (el) el.textContent = total;
        }
        recalcTotal();
      `}}></script>
    </AppShell>
  )
})

evaluatorRoutes.post('/evaluator/projects/:id/evaluate', requireRole('evaluator'), async (c) => {
  const user = c.get('user' as never) as any
  const evaluatorId = await getEvaluatorId(c.get('db'), user.id)
  const projectId = c.req.param('id')
  if (!evaluatorId) return c.redirect('/evaluator/dashboard')

  const evaluation = await c.get('db').one<any>('SELECT * FROM evaluations WHERE evaluator_id = ? AND project_id = ?', [evaluatorId, projectId])
  if (!evaluation) return c.redirect('/evaluator/projects')
  if (evaluation.status === 'completed') return c.redirect(`/evaluator/projects/${projectId}/evaluate`)

  const criteria = await c.get('db').many<any>('SELECT * FROM evaluation_criteria WHERE is_active = 1')
  const body = await c.req.parseBody()

  let total = 0
  for (const cr of criteria) {
    const raw = body[`score_${cr.id}`]
    let score = parseFloat(raw as string) || 0
    score = Math.max(0, Math.min(cr.max_score, score))
    total += score
    await c.get('db').execute('INSERT INTO evaluation_scores (evaluation_id, criterion_id, score) VALUES (?,?,?) ON CONFLICT(evaluation_id, criterion_id) DO UPDATE SET score = excluded.score', [evaluation.id, cr.id, score])
  }

  const strengths = sanitizeText(body.strengths as string, 1500)
  const suggestions = sanitizeText(body.suggestions as string, 1500)
  const comments = sanitizeText(body.comments as string, 1500)

  await c.get('db').execute(`UPDATE evaluations SET status='completed', total_score=?, strengths=?, suggestions=?, comments=?, submitted_at=now(), updated_at=now() WHERE id = ?`, [total, strengths, suggestions, comments, evaluation.id])

  await logAudit(c.get('db'), user.id, 'evaluation_submitted', 'evaluation', evaluation.id, `Score: ${total}`)
  return c.redirect(`/evaluator/projects/${projectId}/evaluate?success=` + encodeURIComponent('Evaluation submitted successfully.'))
})

export default evaluatorRoutes
