import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { getSettings } from '../lib/settings'
import { sanitizeText } from '../lib/validation'
import { logAudit } from '../lib/audit'

const adminSettings = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminSettings.use('/admin/settings', requireRole('organizer', 'super_admin'))
adminSettings.use('/admin/settings/*', requireRole('organizer', 'super_admin'))

adminSettings.get('/admin/settings', async (c) => {
  const user = c.get('user' as never) as any
  const s = await getSettings(c.get('db'))
  const criteria = await c.get('db').many<any>('SELECT * FROM evaluation_criteria ORDER BY sort_order')
  const success = c.req.query('success')

  return c.render(
    <AppShell title="Event Settings" role="organizer" userName={user.full_name} activePath="/admin/settings">
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      <div class="grid-2" style="align-items:flex-start;">
        <div class="dashboard-card">
          <h3>Event Details</h3>
          <form method="post" action="/admin/settings">
            <div class="field"><label>Event Name</label><input name="event_name" value={s.event_name} /></div>
            <div class="field"><label>Tagline</label><input name="tagline" value={s.tagline} /></div>
            <div class="form-row-2">
              <div class="field"><label>Event Date &amp; Time</label><input name="event_date" value={s.event_date || ''} placeholder="e.g. 12 March 2026, 10:00 AM - 5:00 PM" /></div>
              <div class="field"><label>Venue</label><input name="venue" value={s.venue || ''} /></div>
            </div>
            <div class="form-row-2">
              <div class="field"><label>Registration Deadline</label><input name="registration_deadline" value={s.registration_deadline || ''} placeholder="e.g. 10 March 2026, 11:59 PM" /></div>
              <div class="field"><label>Project Submission Deadline</label><input type="date" name="project_deadline" value={s.project_deadline || ''} /></div>
            </div>
            <div class="form-row-2">
              <div class="field"><label>Min Team Size</label><input type="number" name="team_size_min" value={s.team_size_min} min="1" /></div>
              <div class="field"><label>Max Team Size</label><input type="number" name="team_size_max" value={s.team_size_max} min="1" /></div>
            </div>
            <div class="field"><label>Contact Email</label><input type="email" name="contact_email" value={s.contact_email || ''} /></div>
            <div class="field"><label>Scoring Formula</label>
              <select name="scoring_formula">
                <option value="average" selected={s.scoring_formula === 'average'}>Average of evaluator scores</option>
                <option value="best" selected={s.scoring_formula === 'best'}>Best (highest) evaluator score</option>
                <option value="sum" selected={s.scoring_formula === 'sum'}>Sum of evaluator scores</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary">Save Settings</button>
          </form>
        </div>

        <div>
          <div class="dashboard-card" style="margin-bottom:20px;">
            <h3>Module Toggles</h3>
            <form method="post" action="/admin/settings/toggles">
              {[
                ['registration_open', 'Registration Open', s.registration_open],
                ['late_submission_allowed', 'Allow Late Project Submission', s.late_submission_allowed],
                ['module_projects_public', 'Public Project Showcase', s.module_projects_public],
                ['module_schedule_public', 'Public Schedule Page', s.module_schedule_public],
              ].map(([key, label, val]: any) => (
                <label class="checkbox-row" style="margin-bottom:14px;">
                  <input type="checkbox" name={key} checked={!!val} />
                  <span>{label}</span>
                </label>
              ))}
              <button type="submit" class="btn btn-dark btn-sm">Save Toggles</button>
            </form>
          </div>

          <div class="dashboard-card">
            <h3>Evaluation Criteria</h3>
            <p class="hint">Configure scoring criteria used by evaluators. Must total to your desired maximum (commonly 100).</p>
            {criteria.map((cr) => (
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px;">
                <span>{cr.name}</span><span style="font-weight:700;">{cr.max_score} pts</span>
              </div>
            ))}
            <form method="post" action="/admin/settings/criteria" style="margin-top:14px; border-top:1px dashed var(--line); padding-top:14px;">
              <div class="form-row-2">
                <div class="field" style="margin-bottom:8px;"><input name="name" placeholder="Criterion name" required /></div>
                <div class="field" style="margin-bottom:8px;"><input type="number" name="max_score" placeholder="Max score" required min="1" /></div>
              </div>
              <button type="submit" class="btn btn-ghost btn-sm">Add Criterion</button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  )
})

adminSettings.post('/admin/settings', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  await c.get('db').execute(
      `UPDATE event_settings SET event_name=?, tagline=?, event_date=?, venue=?, registration_deadline=?, project_deadline=?, team_size_min=?, team_size_max=?, contact_email=?, scoring_formula=?, updated_at=now() WHERE id=1`, [
      sanitizeText(body.event_name as string, 120) || 'Mini Anveshana',
      sanitizeText(body.tagline as string, 200),
      sanitizeText(body.event_date as string, 100) || null,
      sanitizeText(body.venue as string, 200) || null,
      sanitizeText(body.registration_deadline as string, 100) || null,
      (body.project_deadline as string) || null,
      parseInt(body.team_size_min as string, 10) || 2,
      parseInt(body.team_size_max as string, 10) || 5,
      sanitizeText(body.contact_email as string, 160) || null,
      body.scoring_formula as string
    ])
  await logAudit(c.get('db'), user.id, 'settings_updated', 'event')
  return c.redirect('/admin/settings?success=' + encodeURIComponent('Settings saved.'))
})

adminSettings.post('/admin/settings/toggles', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const flag = (name: string) => (body[name] === 'on' ? 1 : 0)
  await c.get('db').execute('UPDATE event_settings SET registration_open=?, late_submission_allowed=?, module_projects_public=?, module_schedule_public=?, updated_at=now() WHERE id=1', [flag('registration_open'), flag('late_submission_allowed'), flag('module_projects_public'), flag('module_schedule_public')])
  await logAudit(c.get('db'), user.id, 'module_toggles_updated', 'event')
  return c.redirect('/admin/settings?success=' + encodeURIComponent('Module toggles saved.'))
})

adminSettings.post('/admin/settings/criteria', async (c) => {
  const user = c.get('user' as never) as any
  const body = await c.req.parseBody()
  const name = sanitizeText(body.name as string, 80)
  const maxScore = parseInt(body.max_score as string, 10)
  if (!name || !maxScore) return c.redirect('/admin/settings')
  await c.get('db').execute('INSERT INTO evaluation_criteria (name, max_score, sort_order) VALUES (?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM evaluation_criteria))', [name, maxScore])
  await logAudit(c.get('db'), user.id, 'criteria_added', 'evaluation_criteria', undefined, name)
  return c.redirect('/admin/settings?success=' + encodeURIComponent('Criterion added.'))
})

export default adminSettings
