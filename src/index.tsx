import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { Bindings, Vars } from './lib/types'
import { getDatabase } from './lib/db'
import { renderer } from './renderer'
import { attachUser } from './lib/guards'
import { SiteLayout } from './components/layout'

import publicRoutes from './routes/public'
import projectsRoutes from './routes/projects'
import registerRoutes from './routes/register'
import verifyRoutes from './routes/verify'
import resultsRoutes from './routes/results'
import certificateRoutes from './routes/certificate'
import studentRoutes from './routes/student'
import adminAuth from './routes/admin-auth'
import adminDashboard from './routes/admin-dashboard'
import adminRegistrations from './routes/admin-registrations'
import adminTeams from './routes/admin-teams'
import adminColleges from './routes/admin-colleges'
import adminCategories from './routes/admin-categories'
import adminProjects from './routes/admin-projects'
import adminEvaluators from './routes/admin-evaluators'
import adminEvaluations from './routes/admin-evaluations'
import adminResults from './routes/admin-results'
import adminCertificates from './routes/admin-certificates'
import adminCheckin from './routes/admin-checkin'
import adminContent from './routes/admin-content'
import adminAnalytics from './routes/admin-analytics'
import adminSettings from './routes/admin-settings'
import adminAudit from './routes/admin-audit'
import evaluatorRoutes from './routes/evaluator'
import devSeed from './routes/dev-seed'

const app = new Hono<{ Bindings: Bindings; Variables: Vars }>()

app.use(logger())
app.use(renderer)
app.use('*', async (c, next) => {
  const vercelEnv: Bindings = {
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_SETUP_TOKEN: process.env.ADMIN_SETUP_TOKEN,
    ENVIRONMENT: process.env.ENVIRONMENT,
  }
  c.env = { ...vercelEnv, ...(c.env || {}) }
  c.set('db', getDatabase(c.env.DATABASE_URL || ''))
  await next()
})
app.use('*', attachUser)

// Rate limiting (lightweight, in-memory per-isolate best-effort) for auth endpoints
const attemptLog = new Map<string, number[]>()
function requestIp(c: { req: { header(name: string): string | undefined } }): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || 'unknown'
}
function rateLimited(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const arr = (attemptLog.get(key) || []).filter((t) => now - t < windowMs)
  arr.push(now)
  attemptLog.set(key, arr)
  return arr.length > limit
}
app.post('/student/login', async (c, next) => {
  const ip = requestIp(c)
  if (rateLimited(`student:${ip}`)) return c.text('Too many login attempts. Please try again shortly.', 429)
  await next()
})
app.post('/admin/login', async (c, next) => {
  const ip = requestIp(c)
  if (rateLimited(`admin:${ip}`)) return c.text('Too many login attempts. Please try again shortly.', 429)
  await next()
})
app.post('/admin/setup', async (c, next) => {
  const ip = requestIp(c)
  if (rateLimited(`admin-setup:${ip}`, 5)) return c.text('Too many setup attempts. Please try again shortly.', 429)
  await next()
})
app.post('/evaluator/login', async (c, next) => {
  const ip = requestIp(c)
  if (rateLimited(`evaluator:${ip}`)) return c.text('Too many login attempts. Please try again shortly.', 429)
  await next()
})

app.route('/', publicRoutes)
app.route('/', projectsRoutes)
app.route('/', registerRoutes)
app.route('/', verifyRoutes)
app.route('/', resultsRoutes)
app.route('/', certificateRoutes)
app.route('/', studentRoutes)
app.route('/', adminAuth)
app.route('/', adminDashboard)
app.route('/', adminRegistrations)
app.route('/', adminTeams)
app.route('/', adminColleges)
app.route('/', adminCategories)
app.route('/', adminProjects)
app.route('/', adminEvaluators)
app.route('/', adminEvaluations)
app.route('/', adminResults)
app.route('/', adminCertificates)
app.route('/', adminCheckin)
app.route('/', adminContent)
app.route('/', adminAnalytics)
app.route('/', adminSettings)
app.route('/', adminAudit)
app.route('/', evaluatorRoutes)
app.route('/', devSeed)

app.notFound((c) => {
  c.status(404)
  return c.render(
    <SiteLayout title="Page Not Found">
      <div class="error-page">
        <div>
          <div class="code">404</div>
          <h2 style="margin-top:10px;">Looks like this page took a wrong turn.</h2>
          <p style="color:var(--ink-500); margin-bottom:20px;">The page you're looking for doesn't exist or may have moved.</p>
          <a href="/" class="btn btn-dark">Back to Home</a>
        </div>
      </div>
    </SiteLayout>
  )
})

app.onError((err, c) => {
  console.error(err)
  c.status(500)
  return c.render(
    <SiteLayout title="Something Went Wrong">
      <div class="error-page">
        <div>
          <div class="code">500</div>
          <h2 style="margin-top:10px;">Something went wrong. Please try again.</h2>
          <p style="color:var(--ink-500); margin-bottom:20px;">If this keeps happening, please contact the organizing team.</p>
          <a href="/" class="btn btn-dark">Back to Home</a>
        </div>
      </div>
    </SiteLayout>
  )
})

export default app
