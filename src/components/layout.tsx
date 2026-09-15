import { html } from 'hono/html'
import type { FC } from 'hono/jsx'

type SiteLayoutProps = {
  title?: string
  description?: string
  activePath?: string
  children: any
}

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/categories', label: 'Categories' },
  { href: '/rules', label: 'Rules' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/projects', label: 'Projects' },
  { href: '/results', label: 'Results' },
]

export const SiteHead: FC<{ title?: string; description?: string }> = ({ title, description }) => (
  <head>
    <meta charSet="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title ? `${title} · Mini Anveshana` : 'Mini Anveshana — Bring Your Idea. Build Your Solution.'}</title>
    <meta name="description" content={description || 'Mini Anveshana is an inter-college student innovation event where teams turn ideas into practical solutions.'} />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2222%22 fill=%22%230b1730%22/><text x=%2250%22 y=%2266%22 font-size=%2255%22 fill=%22%23f59e0b%22 font-family=%22Georgia%22 text-anchor=%22middle%22>M</text></svg>" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link href="/static/style.css" rel="stylesheet" />
  </head>
)

export function SiteHeader(activePath?: string) {
  return (
    <header class="site-header">
      <div class="container nav-wrap">
        <a href="/" class="brand">
          <span class="mark">M</span>
          <span>
            MINI ANVESHANA
            <small>Bring Your Idea. Build Your Solution.</small>
          </span>
        </a>
        <nav class="nav-links" id="nav-links">
          {NAV_ITEMS.map((item) => (
            <a href={item.href} class={activePath === item.href ? 'active' : ''}>{item.label}</a>
          ))}
          <div class="nav-links-mobile-actions">
            <a href="/student/login" class="btn btn-outline btn-sm">Student Login</a>
            <a href="/admin/login" class="btn btn-ghost btn-sm">Admin Login</a>
            <a href="/register" class="btn btn-primary btn-sm">Register Team</a>
          </div>
        </nav>
        <div class="nav-cta">
          <a href="/student/login" class="btn btn-outline btn-sm nav-desktop-only">Student Login</a>
          <a href="/admin/login" class="btn btn-ghost btn-sm nav-desktop-only">Admin Login</a>
          <a href="/register" class="btn btn-primary btn-sm">Register Team</a>
          <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation" aria-controls="nav-links" aria-expanded="false">☰</button>
        </div>
      </div>
      {html`<script>
        document.getElementById('nav-toggle')?.addEventListener('click', function () {
          var nav = document.getElementById('nav-links');
          var open = nav.classList.toggle('open');
          this.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      </script>`}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <h4 style="color:#fff;">Mini Anveshana</h4>
            <p style="max-width:320px; color:#a9b7d4; font-size:14px;">An inter-college platform where students turn ideas into practical solutions, present their projects, and learn from a community of innovators.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <a href="/about">About the event</a>
            <a href="/categories">Categories</a>
            <a href="/rules">Rules &amp; Guidelines</a>
            <a href="/schedule">Schedule</a>
            <a href="/announcements">Announcements</a>
          </div>
          <div>
            <h4>Participate</h4>
            <a href="/register">Register your team</a>
            <a href="/projects">Project showcase</a>
            <a href="/results">Results</a>
            <a href="/certificate/verify">Verify certificate</a>
          </div>
          <div>
            <h4>Portals</h4>
            <a href="/student/login">Student login</a>
            <a href="/evaluator/login">Evaluator login</a>
            <a href="/admin/login">Organizer login</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© <span id="footer-year"></span> Mini Anveshana. Organized by the event team.</span>
          <span>Contact the organizing team for event support.</span>
        </div>
      </div>
      {html`<script>document.getElementById('footer-year').textContent = new Date().getFullYear();</script>`}
    </footer>
  )
}

export const SiteLayout: FC<SiteLayoutProps> = ({ title, description, activePath, children }) => (
  <html lang="en">
    <SiteHead title={title} description={description} />
    <body>
      {SiteHeader(activePath)}
      <main>{children}</main>
      {SiteFooter()}
    </body>
  </html>
)
