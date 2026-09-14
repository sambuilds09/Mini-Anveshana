import { qrSvg } from '../lib/qr'

export function RegistrationPass({ team, categoryName, verifyBaseUrl }: { team: any; categoryName?: string; verifyBaseUrl: string }) {
  const qr = qrSvg(`${verifyBaseUrl}/verify?token=${team.qr_token}`, 180)
  return (
    <div>
      <div class="pass-card animate-in" id="pass-card">
        <div class="pass-head">
          <div>
            <div class="pass-brand">MINI ANVESHANA</div>
            <div style="font-size:11px; color:#9fadc9;">Event Pass</div>
          </div>
          <div class="pass-id">{team.registration_id}</div>
        </div>
        <div class="pass-qr" dangerouslySetInnerHTML={{ __html: qr }}></div>
        <div class="pass-row"><span class="l">Team</span><span class="r">{team.team_name}</span></div>
        <div class="pass-row"><span class="l">College</span><span class="r">{team.college_name || '—'}</span></div>
        <div class="pass-row"><span class="l">Category</span><span class="r">{categoryName || '—'}</span></div>
        <div class="pass-row"><span class="l">Status</span><span class="r">{team.status.replace('_', ' ').toUpperCase()}</span></div>
      </div>
      <div style="text-align:center; margin-top:18px; display:flex; gap:10px; justify-content:center;">
        <button onclick="window.print()" class="btn btn-dark btn-sm">&#128424; Print Pass</button>
      </div>
    </div>
  )
}
