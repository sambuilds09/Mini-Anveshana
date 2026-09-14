import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { CertificateView } from '../components/certificate'
import { logAudit } from '../lib/audit'

const certificateRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

certificateRoutes.get('/certificate/verify', async (c) => {
  const id = c.req.query('id')?.trim() || ''
  let cert: any = null
  let notFound = false

  if (id) {
    cert = await c.get('db').one<any>(
        `SELECT cert.*, t.team_name, t.registration_id, col.name as college_name
         FROM certificates cert
         JOIN teams t ON t.id = cert.team_id
         JOIN colleges col ON col.id = t.college_id
         WHERE cert.certificate_id = ? AND cert.is_available = 1`
      , [id])
    notFound = !cert
    if (cert) {
      await c.get('db').execute('INSERT INTO certificate_verifications (certificate_id) VALUES (?)', [id])
    }
  }

  return c.render(
    <SiteLayout title="Verify Certificate">
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / Verify Certificate</div>
          <div class="section-head">
            <div class="kicker">Certificate Verification</div>
            <h2>Verify a certificate</h2>
            <p>Enter the certificate ID printed on the certificate to confirm it's genuine.</p>
          </div>
          <form method="get" class="form-card" style="max-width:480px; margin-bottom:26px;">
            <div class="field"><label>Certificate ID</label><input name="id" placeholder="e.g. MA26-CERT-000123" value={id} /></div>
            <button type="submit" class="btn btn-primary btn-block">Verify</button>
          </form>

          {id && notFound && (
            <div class="alert alert-error">&#10060; No certificate found with that ID. Double-check the code and try again.</div>
          )}
          {cert && (
            <div>
              <div class="alert alert-success">&#9989; Certificate Verified</div>
              <div class="card">
                <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Name</span><span class="r">{cert.recipient_name}</span></div>
                <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Team</span><span class="r">{cert.team_name}</span></div>
                <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">College</span><span class="r">{cert.college_name}</span></div>
                <div class="pass-row" style="border-color:var(--line);"><span class="l" style="color:var(--ink-500);">Type</span><span class="r">{cert.cert_type.replace('_', ' ')}</span></div>
                <div class="pass-row" style="border:none;"><span class="l" style="color:var(--ink-500);">Issued</span><span class="r">{new Date(cert.issued_at).toLocaleDateString()}</span></div>
              </div>
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  )
})

export default certificateRoutes
