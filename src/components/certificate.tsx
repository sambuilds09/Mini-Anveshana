import { qrSvg } from '../lib/qr'

export function CertificateView({ cert, baseUrl }: { cert: any; baseUrl: string }) {
  const qr = qrSvg(`${baseUrl}/certificate/verify?id=${cert.certificate_id}`, 110)
  const typeLabel: Record<string, string> = {
    participation: 'Certificate of Participation',
    winner: 'Certificate of Excellence — Winner',
    runner_up: 'Certificate of Excellence — Runner Up',
    special_mention: 'Certificate of Special Mention',
  }
  return (
    <div style="border:10px solid #0b1730; border-radius:18px; padding:50px 40px; max-width:760px; margin:0 auto; background:linear-gradient(180deg,#fff,#f7f8fb); position:relative;" id="certificate">
      <div style="position:absolute; top:18px; left:18px; right:18px; bottom:18px; border:1px solid #d9a441; border-radius:10px; pointer-events:none;"></div>
      <div style="text-align:center;">
        <div style="font-family: 'Fraunces', serif; font-weight:700; font-size:15px; letter-spacing:.12em; color:#0b1730;">MINI ANVESHANA</div>
        <div style="font-size:11px; letter-spacing:.1em; color:#b45309; margin-bottom:22px;">BRING YOUR IDEA. BUILD YOUR SOLUTION.</div>
        <h1 style="font-size:26px; margin-bottom:4px;">{typeLabel[cert.cert_type] || 'Certificate of Participation'}</h1>
        <p style="color:#64748a; margin-bottom:22px;">This is to certify that</p>
        <div style="font-family:'Fraunces',serif; font-size:32px; font-weight:600; color:#0b1730; margin-bottom:22px;">{cert.recipient_name}</div>
        <p style="color:#33415a; max-width:480px; margin:0 auto 26px;">participated in Mini Anveshana, an inter-college student innovation event, as part of team <strong>{cert.team_name}</strong> representing <strong>{cert.college_name}</strong>.</p>
        <div style="display:flex; justify-content:center; gap:50px; margin:26px 0; flex-wrap:wrap;">
          <div><div style="font-size:11px; color:#64748a; text-transform:uppercase; letter-spacing:.05em;">Registration ID</div><div style="font-weight:700;">{cert.registration_id}</div></div>
          <div><div style="font-size:11px; color:#64748a; text-transform:uppercase; letter-spacing:.05em;">Certificate ID</div><div style="font-weight:700;">{cert.certificate_id}</div></div>
          <div><div style="font-size:11px; color:#64748a; text-transform:uppercase; letter-spacing:.05em;">Date</div><div style="font-weight:700;">{new Date(cert.issued_at).toLocaleDateString()}</div></div>
        </div>
        <div style="display:flex; justify-content:center; margin-top:10px;" dangerouslySetInnerHTML={{ __html: qr }}></div>
        <div style="font-size:11px; color:#94a3b8; margin-top:8px;">Scan to verify this certificate</div>
      </div>
    </div>
  )
}
