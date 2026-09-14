import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { RegistrationPass } from '../components/pass'
import { getStorage } from '../lib/storage'

const verifyRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

// Public QR verification endpoint — used by check-in scanner AND public link.
// Exposes only non-sensitive team/registration identity data (no personal emails/phones).
verifyRoutes.get('/verify', async (c) => {
  const token = c.req.query('token') || ''
  const team = await c.get('db').one<any>(`SELECT t.*, col.name as college_name FROM teams t JOIN colleges col ON col.id = t.college_id WHERE t.qr_token = ?`, [token])

  if (!token || !team) {
    return c.render(
      <SiteLayout title="Verify Registration">
        <section class="section"><div class="container-narrow empty-state"><div class="icon">&#10060;</div><h3>Invalid or unknown code</h3><p>This QR code / token could not be verified.</p></div></section>
      </SiteLayout>
    )
  }

  const project = await c.get('db').one<any>(`SELECT p.title, cat.name as category_name FROM projects p LEFT JOIN categories cat ON cat.id = p.category_id WHERE p.team_id = ?`, [team.id])

  return c.render(
    <SiteLayout title="Verify Registration">
      <section class="section">
        <div class="container-narrow">
          <div style="text-align:center; margin-bottom:24px;">
            <div class="icon-badge blue" style="margin:0 auto; width:56px; height:56px; font-size:24px;">&#9989;</div>
            <h2 style="margin-top:14px;">Registration Verified</h2>
          </div>
          <div class="card" style="max-width:480px; margin:0 auto;">
            <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Registration ID</span><span class="r">{team.registration_id}</span></div>
            <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Team</span><span class="r">{team.team_name}</span></div>
            <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">College</span><span class="r">{team.college_name}</span></div>
            <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Project</span><span class="r">{project?.title || '—'}</span></div>
            <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Category</span><span class="r">{project?.category_name || '—'}</span></div>
            <div class="pass-row" style="border:none;"><span class="l" style="color:var(--ink-500);">Status</span><span class={`badge ${team.status === 'approved' ? 'badge-success' : 'badge-warn'}`}>{team.status.replace('_', ' ')}</span></div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
})

verifyRoutes.get('/registration/pass', async (c) => {
  const regId = c.req.query('id') || ''
  const team = await c.get('db').one<any>(`SELECT t.*, col.name as college_name FROM teams t JOIN colleges col ON col.id = t.college_id WHERE t.registration_id = ?`, [regId])
  if (!team) return c.notFound()
  const project = await c.get('db').one<any>(`SELECT cat.name as category_name FROM projects p LEFT JOIN categories cat ON cat.id = p.category_id WHERE p.team_id = ?`, [team.id])
  const baseUrl = new URL(c.req.url).origin

  return c.render(
    <SiteLayout title="Registration Pass">
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / Registration Pass</div>
          <RegistrationPass team={team} categoryName={project?.category_name} verifyBaseUrl={baseUrl} />
        </div>
      </section>
    </SiteLayout>
  )
})

// Public application file serving — restricted to project IMAGES only (abstract/presentation docs
// may contain sensitive team info and are served via authenticated routes instead).
verifyRoutes.get('/files/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const record = await c.get('db').one<any>(
    `SELECT pf.r2_key, pf.content_type
     FROM project_files pf
     JOIN projects p ON p.id = pf.project_id
     JOIN teams t ON t.id = p.team_id
     WHERE pf.r2_key = ? AND pf.file_type = 'image' AND p.is_approved_public = 1 AND t.status = 'approved'`,
    [key],
  )
  if (!record) return c.notFound()
  const obj = await getStorage(c.env).download(key)
  if (!obj) return c.notFound()
  return new Response(obj.body, {
    headers: {
      'Content-Type': record.content_type || obj.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

export default verifyRoutes
