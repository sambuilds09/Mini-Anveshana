import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { AppShell } from '../components/app-shell'
import { requireRole } from '../lib/guards'
import { nextCertificateId } from '../lib/ids'
import { getSettings } from '../lib/settings'
import { logAudit } from '../lib/audit'

const adminCertificates = new Hono<{ Bindings: Bindings; Variables: Vars }>()
adminCertificates.use('/admin/certificates', requireRole('organizer', 'super_admin'))
adminCertificates.use('/admin/certificates/*', requireRole('organizer', 'super_admin'))

adminCertificates.get('/admin/certificates', async (c) => {
  const user = c.get('user' as never) as any
  const s = await getSettings(c.get('db'))
  const success = c.req.query('success')

  const eligibleTeams = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE status IN ('registered','approved') AND checked_in = 1`)
  const issued = await c.get('db').one<{ n: number }>('SELECT COUNT(*) as n FROM certificates')

  const rows = await c.get('db').many<any>(
        `SELECT cert.certificate_id, cert.recipient_name, cert.cert_type, cert.issued_at, t.team_name, col.name as college_name
         FROM certificates cert JOIN teams t ON t.id = cert.team_id JOIN colleges col ON col.id = t.college_id
         ORDER BY cert.id DESC LIMIT 100`
        )

  return c.render(
    <AppShell title="Certificates" role="organizer" userName={user.full_name} activePath="/admin/certificates">
      {success && <div class="alert alert-success">{decodeURIComponent(success)}</div>}

      <div class="grid-2" style="margin-bottom:24px;">
        <div class="dashboard-card">
          <h3>Module Status</h3>
          <div class="meta">Certificates are currently <strong>{s.certificates_enabled ? 'enabled' : 'disabled'}</strong> for students.</div>
          <form method="post" action="/admin/certificates/toggle-module"><button class="btn btn-sm btn-dark" type="submit">{s.certificates_enabled ? 'Disable' : 'Enable'} Certificate Module</button></form>
        </div>
        <div class="dashboard-card">
          <h3>Generate Certificates</h3>
          <div class="meta">{eligibleTeams?.n || 0} checked-in, approved teams eligible. {issued?.n || 0} certificates issued so far.</div>
          <form method="post" action="/admin/certificates/generate" onsubmit="return confirm('Generate participation certificates for all eligible members who don\\'t already have one?')">
            <button class="btn btn-sm btn-primary" type="submit">Generate Participation Certificates</button>
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div class="empty-state"><div class="icon">&#127891;</div><h3>No certificates issued yet</h3><p>Generate certificates once the event has concluded and check-ins are recorded.</p></div>
      ) : (
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Certificate ID</th><th>Recipient</th><th>Team</th><th>College</th><th>Type</th><th>Issued</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td style="font-weight:600;">{r.certificate_id}</td>
                  <td>{r.recipient_name}</td>
                  <td>{r.team_name}</td>
                  <td>{r.college_name}</td>
                  <td>{r.cert_type.replace('_', ' ')}</td>
                  <td>{new Date(r.issued_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
})

adminCertificates.post('/admin/certificates/toggle-module', async (c) => {
  const user = c.get('user' as never) as any
  const s = await getSettings(c.get('db'))
  await c.get('db').execute('UPDATE event_settings SET certificates_enabled = ?, updated_at = now() WHERE id = 1', [s.certificates_enabled ? 0 : 1])
  await logAudit(c.get('db'), user.id, 'certificate_module_toggled', 'event')
  return c.redirect('/admin/certificates')
})

adminCertificates.post('/admin/certificates/generate', async (c) => {
  const user = c.get('user' as never) as any
  const year = new Date().getFullYear().toString().slice(-2)

  const members = await c.get('db').many<any>(
        `SELECT m.id as member_id, m.full_name, t.id as team_id
         FROM team_members m JOIN teams t ON t.id = m.team_id
         WHERE t.status IN ('registered','approved') AND t.checked_in = 1
           AND m.id NOT IN (SELECT member_id FROM certificates WHERE member_id IS NOT NULL)`
        )

  let count = 0
  for (const m of members) {
    const certId = await nextCertificateId(c.get('db'), year)
    await c.get('db').execute('INSERT INTO certificates (certificate_id, team_id, member_id, recipient_name, cert_type) VALUES (?,?,?,?,\'participation\')', [certId, m.team_id, m.member_id, m.full_name])
    count++
  }
  await c.get('db').execute('UPDATE event_settings SET certificates_enabled = 1, updated_at = now() WHERE id = 1')
  await logAudit(c.get('db'), user.id, 'certificates_generated', 'event', undefined, `${count} certificates generated`)
  return c.redirect('/admin/certificates?success=' + encodeURIComponent(`${count} new certificates generated.`))
})

export default adminCertificates
