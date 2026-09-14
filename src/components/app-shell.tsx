import type { FC } from 'hono/jsx'
import { SiteHead } from './layout'

type NavItem = { href: string; label: string; icon: string }
type AppShellProps = {
  title: string
  role: 'student' | 'organizer' | 'evaluator'
  userName: string
  activePath: string
  children: any
  topbarActions?: any
  subtitle?: string
}

const STUDENT_NAV: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: '&#9670;' },
  { href: '/student/team', label: 'My Team', icon: '&#128101;' },
  { href: '/student/project', label: 'Project', icon: '&#128187;' },
  { href: '/student/announcements', label: 'Announcements', icon: '&#128276;' },
  { href: '/student/schedule', label: 'Schedule', icon: '&#128197;' },
]

const ADMIN_NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Overview', items: [
    { href: '/admin/dashboard', label: 'Live Dashboard', icon: '&#9670;' },
    { href: '/admin/analytics', label: 'Analytics', icon: '&#128202;' },
  ]},
  { section: 'Registrations', items: [
    { href: '/admin/registrations', label: 'Manage Registrations', icon: '&#128203;' },
    { href: '/admin/teams', label: 'Teams', icon: '&#128101;' },
    { href: '/admin/colleges', label: 'Manage Colleges', icon: '&#127979;' },
    { href: '/admin/categories', label: 'Manage Categories', icon: '&#127991;' },
  ]},
  { section: 'Projects & Judging', items: [
    { href: '/admin/projects', label: 'Manage Projects', icon: '&#128187;' },
    { href: '/admin/evaluators', label: 'Manage Evaluators', icon: '&#129489;&#8205;&#127979;' },
    { href: '/admin/evaluations', label: 'Evaluations', icon: '&#9878;' },
    { href: '/admin/results', label: 'Results', icon: '&#127942;' },
  ]},
  { section: 'Event Day', items: [
    { href: '/admin/check-in', label: 'QR Check-in', icon: '&#128241;' },
    { href: '/admin/schedule', label: 'Event Schedule', icon: '&#128197;' },
    { href: '/admin/announcements', label: 'Announcements', icon: '&#128276;' },
    { href: '/admin/certificates', label: 'Certificates', icon: '&#127891;' },
  ]},
  { section: 'System', items: [
    { href: '/admin/settings', label: 'Event Settings', icon: '&#9881;' },
    { href: '/admin/audit-log', label: 'Audit Log', icon: '&#128220;' },
  ]},
]

const EVALUATOR_NAV: NavItem[] = [
  { href: '/evaluator/dashboard', label: 'Dashboard', icon: '&#9670;' },
  { href: '/evaluator/projects', label: 'Assigned Projects', icon: '&#128187;' },
]

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'U'
}

export const AppShell: FC<AppShellProps> = ({ title, role, userName, activePath, children, topbarActions, subtitle }) => {
  const logoutHref = role === 'student' ? '/student/logout' : role === 'evaluator' ? '/evaluator/logout' : '/admin/logout'
  return (
    <html lang="en">
      <SiteHead title={title} />
      <body>
        <div class="app-shell">
          <aside class="app-sidebar">
            <a href="/" class="brand">
              <span class="mark">M</span>
              <span>MINI ANVESHANA<small>{role === 'student' ? 'Student Portal' : role === 'evaluator' ? 'Evaluator Portal' : 'Organizer Console'}</small></span>
            </a>
            {role === 'student' && (
              <div>
                <div class="side-section">Menu</div>
                {STUDENT_NAV.map((item) => (
                  <a href={item.href} class={`side-link ${activePath === item.href ? 'active' : ''}`}>
                    <span class="ic" dangerouslySetInnerHTML={{ __html: item.icon }}></span>{item.label}
                  </a>
                ))}
              </div>
            )}
            {role === 'evaluator' && (
              <div>
                <div class="side-section">Menu</div>
                {EVALUATOR_NAV.map((item) => (
                  <a href={item.href} class={`side-link ${activePath === item.href || activePath.startsWith(item.href + '/') ? 'active' : ''}`}>
                    <span class="ic" dangerouslySetInnerHTML={{ __html: item.icon }}></span>{item.label}
                  </a>
                ))}
              </div>
            )}
            {role === 'organizer' && ADMIN_NAV.map((group) => (
              <div>
                <div class="side-section">{group.section}</div>
                {group.items.map((item) => (
                  <a href={item.href} class={`side-link ${activePath === item.href ? 'active' : ''}`}>
                    <span class="ic" dangerouslySetInnerHTML={{ __html: item.icon }}></span>{item.label}
                  </a>
                ))}
              </div>
            ))}
            <div style="margin-top:24px; border-top:1px solid rgba(255,255,255,.08); padding-top:14px;">
              <a href={logoutHref} class="side-link">&#8618; Log out</a>
            </div>
          </aside>
          <main class="app-main">
            <div class="app-topbar">
              <div>
                <h1>{title}</h1>
                {subtitle && <div class="sub">{subtitle}</div>}
              </div>
              <div style="display:flex; align-items:center; gap:12px;">
                {topbarActions}
                <div class="user-chip">
                  <span class="avatar">{initials(userName)}</span>
                  {userName}
                </div>
              </div>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
