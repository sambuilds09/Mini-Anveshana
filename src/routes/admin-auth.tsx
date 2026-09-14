import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, getSessionCookieValue } from '../lib/auth'
import { sanitizeText } from '../lib/validation'
import { logAudit } from '../lib/audit'

const adminAuth = new Hono<{ Bindings: Bindings; Variables: Vars }>()

adminAuth.get('/admin/login', async (c) => {
  const error = c.req.query('error')
  const next = c.req.query('next') || '/admin/dashboard'
  return c.render(
    <SiteLayout title="Organizer Login">
      <section class="section">
        <div class="container-narrow" style="max-width:440px;">
          <div class="section-head" style="text-align:center; margin:0 auto 26px;">
            <div class="kicker">Organizer Console</div>
            <h2>Organizer / Admin Login</h2>
          </div>
          {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
          {c.req.query('success') && <div class="alert alert-success">{decodeURIComponent(c.req.query('success') || '')}</div>}
          <form method="post" action="/admin/login" class="form-card">
            <input type="hidden" name="next" value={next} />
            <div class="field"><label>Email</label><input type="email" name="email" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" required /></div>
            <button type="submit" class="btn btn-primary btn-block">Log In</button>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
})

adminAuth.get('/admin/setup', async (c) => {
  const configured = Boolean(c.env.ADMIN_SETUP_TOKEN)
  const hasAdmin = await c.get('db').one(`SELECT 1 FROM users WHERE role IN ('organizer','super_admin') LIMIT 1`)
  if (!configured || hasAdmin) return c.redirect('/admin/login')
  const error = c.req.query('error')

  return c.render(
    <SiteLayout title="Set Up Admin Account">
      <section class="section">
        <div class="container-narrow" style="max-width:500px;">
          <div class="section-head" style="text-align:center; margin:0 auto 26px;">
            <div class="kicker">First-time setup</div>
            <h2>Create the admin account</h2>
            <p>This one-time setup is protected by the ADMIN_SETUP_TOKEN environment secret.</p>
          </div>
          {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
          <form method="post" action="/admin/setup" class="form-card">
            <div class="field"><label>Setup token</label><input type="password" name="setup_token" required /></div>
            <div class="field"><label>Admin name</label><input name="full_name" maxlength="120" required /></div>
            <div class="field"><label>Admin email</label><input type="email" name="email" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" minlength="12" required /></div>
            <button type="submit" class="btn btn-primary btn-block">Create Admin Account</button>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
})

adminAuth.post('/admin/setup', async (c) => {
  if (!c.env.ADMIN_SETUP_TOKEN) return c.json({ error: 'Admin setup is not enabled.' }, 404)
  const body = await c.req.parseBody()
  const setupToken = (body.setup_token as string) || ''
  if (setupToken !== c.env.ADMIN_SETUP_TOKEN) return c.redirect('/admin/setup?error=' + encodeURIComponent('Invalid setup token.'))

  const existing = await c.get('db').one(`SELECT 1 FROM users WHERE role IN ('organizer','super_admin') LIMIT 1`)
  if (existing) return c.redirect('/admin/login')

  const fullName = sanitizeText(body.full_name as string, 120)
  const email = sanitizeText(body.email as string, 160).toLowerCase()
  const password = (body.password as string) || ''
  if (!fullName || !email || password.length < 12) {
    return c.redirect('/admin/setup?error=' + encodeURIComponent('Use a valid name, email, and password of at least 12 characters.'))
  }

  const passwordHash = await hashPassword(password)
  await c.get('db').execute(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, 'super_admin')`, [email, passwordHash, fullName])
  return c.redirect('/admin/login?success=' + encodeURIComponent('Admin account created. You can now sign in.'))
})

adminAuth.post('/admin/login', async (c) => {
  const body = await c.req.parseBody()
  const email = sanitizeText(body.email as string, 160).toLowerCase()
  const password = (body.password as string) || ''
  const next = (body.next as string) || '/admin/dashboard'

  const user = await c.get('db').one<any>(`SELECT * FROM users WHERE email = ? AND role IN ('organizer','super_admin')`, [email])
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.redirect('/admin/login?error=' + encodeURIComponent('Incorrect email or password.'))
  }
  if (!user.is_active) return c.redirect('/admin/login?error=' + encodeURIComponent('This account has been deactivated.'))

  const sid = await createSession(c.get('db'), user.id)
  setSessionCookie(c, sid)
  await logAudit(c.get('db'), user.id, 'admin_login', 'user', user.id)
  return c.redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/admin/dashboard')
})

adminAuth.get('/admin/logout', async (c) => {
  const sid = getSessionCookieValue(c)
  if (sid) await destroySession(c.get('db'), sid)
  clearSessionCookie(c)
  return c.redirect('/admin/login')
})

// ---------------------------------------------------------------- Evaluator auth
adminAuth.get('/evaluator/login', async (c) => {
  const error = c.req.query('error')
  const next = c.req.query('next') || '/evaluator/dashboard'
  return c.render(
    <SiteLayout title="Evaluator Login">
      <section class="section">
        <div class="container-narrow" style="max-width:440px;">
          <div class="section-head" style="text-align:center; margin:0 auto 26px;">
            <div class="kicker">Evaluator Portal</div>
            <h2>Evaluator Login</h2>
          </div>
          {error && <div class="alert alert-error">{decodeURIComponent(error)}</div>}
          <form method="post" action="/evaluator/login" class="form-card">
            <input type="hidden" name="next" value={next} />
            <div class="field"><label>Email</label><input type="email" name="email" required /></div>
            <div class="field"><label>Password</label><input type="password" name="password" required /></div>
            <button type="submit" class="btn btn-primary btn-block">Log In</button>
          </form>
        </div>
      </section>
    </SiteLayout>
  )
})

adminAuth.post('/evaluator/login', async (c) => {
  const body = await c.req.parseBody()
  const email = sanitizeText(body.email as string, 160).toLowerCase()
  const password = (body.password as string) || ''
  const next = (body.next as string) || '/evaluator/dashboard'

  const user = await c.get('db').one<any>(`SELECT * FROM users WHERE email = ? AND role = 'evaluator'`, [email])
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.redirect('/evaluator/login?error=' + encodeURIComponent('Incorrect email or password.'))
  }
  if (!user.is_active) return c.redirect('/evaluator/login?error=' + encodeURIComponent('This account has been deactivated.'))

  const sid = await createSession(c.get('db'), user.id)
  setSessionCookie(c, sid)
  return c.redirect(next)
})

adminAuth.get('/evaluator/logout', async (c) => {
  const sid = getSessionCookieValue(c)
  if (sid) await destroySession(c.get('db'), sid)
  clearSessionCookie(c)
  return c.redirect('/evaluator/login')
})

export default adminAuth
