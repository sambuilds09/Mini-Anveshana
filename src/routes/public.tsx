import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { SiteLayout } from '../components/layout'
import { getSettings, fmt } from '../lib/settings'

const publicRoutes = new Hono<{ Bindings: Bindings; Variables: Vars }>()

// ---------------------------------------------------------------- Home
publicRoutes.get('/', async (c) => {
  const s = await getSettings(c.get('db'))
  const categories = await c.get('db').many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order LIMIT 6')
  const projectCountRow = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM projects WHERE is_approved_public = 1`)
  const teamCountRow = await c.get('db').one<{ n: number }>(`SELECT COUNT(*) as n FROM teams WHERE status = 'approved'`)

  return c.render(
    <SiteLayout title="Home" activePath="/">
      <section class="hero">
        <div class="container hero-grid">
          <div>
            <span class="eyebrow">Inter-College Student Innovation Event</span>
            <h1>{s.event_name}</h1>
            <div class="headline">{s.tagline}</div>
            <p class="lede">An inter-college platform where students turn ideas into practical solutions, present their projects, and learn from a community of innovators.</p>
            <div class="hero-actions">
              <a href="/register" class="btn btn-primary">Register Your Team</a>
              <a href="/projects" class="btn btn-outline">Explore Projects</a>
            </div>
          </div>
          <div class="hero-panel animate-in">
            <div class="panel-row">
              <div class="panel-icon">&#128197;</div>
              <div><div class="panel-label">Event Date</div><div class="panel-value">{fmt(s.event_date, 'To be announced')}</div></div>
            </div>
            <div class="panel-row">
              <div class="panel-icon">&#128205;</div>
              <div><div class="panel-label">Venue</div><div class="panel-value">{fmt(s.venue, 'To be announced')}</div></div>
            </div>
            <div class="panel-row">
              <div class="panel-icon">&#9203;</div>
              <div><div class="panel-label">Registration Deadline</div><div class="panel-value">{fmt(s.registration_deadline, 'To be announced')}</div></div>
            </div>
            <div class="panel-row">
              <div class="panel-icon">&#128101;</div>
              <div><div class="panel-label">Team Size</div><div class="panel-value">{s.team_size_min}–{s.team_size_max} members</div></div>
            </div>
          </div>
        </div>
      </section>

      <div class="facts-strip">
        <div class="container facts-grid">
          <div class="fact-item"><div class="label">Event Date</div><div class="value">{fmt(s.event_date, 'To be announced')}</div></div>
          <div class="fact-item"><div class="label">Venue</div><div class="value">{fmt(s.venue, 'To be announced')}</div></div>
          <div class="fact-item"><div class="label">Registration Deadline</div><div class="value">{fmt(s.registration_deadline, 'To be announced')}</div></div>
          <div class="fact-item"><div class="label">Team Size</div><div class="value">{s.team_size_min}–{s.team_size_max} members per team</div></div>
        </div>
      </div>

      <section class="section">
        <div class="container">
          <div class="section-head">
            <div class="kicker">Why Mini Anveshana</div>
            <h2>Have an idea worth building?</h2>
            <p>This is your stage to bring your team, build a working solution, and show it to people who care about good ideas.</p>
          </div>
          <div class="grid-3">
            <div class="card">
              <div class="icon-badge blue">&#128161;</div>
              <h3>Bring your team</h3>
              <p>Form a team with your classmates, pick a problem you care about, and register together in one simple process.</p>
            </div>
            <div class="card">
              <div class="icon-badge amber">&#128295;</div>
              <h3>Build your solution</h3>
              <p>Work on a real, working prototype — not just slides. Submit your project details, files, and a short demo.</p>
            </div>
            <div class="card">
              <div class="icon-badge navy">&#127942;</div>
              <h3>Show us what you built</h3>
              <p>Present your project to evaluators, get feedback, and see how your solution stacks up across colleges.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="section section-alt">
        <div class="container">
          <div class="section-head">
            <div class="kicker">Explore</div>
            <h2>Project categories</h2>
            <p>Pick the track that fits your idea. Categories are managed by the organizing team and can change before registration closes.</p>
          </div>
          <div class="grid-3">
              {categories.map((cat) => (
              <a href={`/categories`} class="card">
                <h3 style="font-size:17px;">{cat.name}</h3>
                <p style="font-size:14px; margin:0;">{cat.description || 'Details coming soon.'}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-head" style="margin-bottom:26px;">
            <div class="kicker">Showcase</div>
            <h2>Projects from the community</h2>
            <p>{(projectCountRow?.n || 0)} projects currently published from {(teamCountRow?.n || 0)} approved teams.</p>
          </div>
          <div class="hero-actions">
            <a href="/projects" class="btn btn-dark">View the full showcase</a>
            <a href="/register" class="btn btn-ghost">Register your team &rarr;</a>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
})

// ---------------------------------------------------------------- About
publicRoutes.get('/about', async (c) => {
  const s = await getSettings(c.get('db'))
  return c.render(
    <SiteLayout title="About" activePath="/about">
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / About</div>
          <h1 style="font-size:38px;">About Mini Anveshana</h1>
          <p style="font-size:16.5px; color:var(--ink-700);">Mini Anveshana is an inter-college student innovation event. Teams from different colleges come together to pick a real problem, build a working solution, and present it to a panel of evaluators.</p>
          <p style="font-size:16.5px; color:var(--ink-700);">The idea is simple: give students a reason to build something real, and a stage to show it off. Whether your project is a mobile app, a hardware prototype, or a data tool — if it solves a problem, there's a place for it here.</p>
          <div class="grid-2" style="margin-top:36px;">
            <div class="card">
              <div class="icon-badge blue">&#127891;</div>
              <h3>Organized by</h3>
              <p>The Mini Anveshana organizing team</p>
            </div>
            <div class="card">
              <div class="icon-badge amber">&#9993;</div>
              <h3>Contact</h3>
              <p>{fmt(s.contact_email, 'Use the admin contact configured for this event')}</p>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  )
})

// ---------------------------------------------------------------- Categories
publicRoutes.get('/categories', async (c) => {
  const categories = await c.get('db').many<any>('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order')
  return c.render(
    <SiteLayout title="Categories" activePath="/categories">
      <section class="section">
        <div class="container">
          <div class="breadcrumb"><a href="/">Home</a> / Categories</div>
          <div class="section-head">
            <div class="kicker">Tracks</div>
            <h2>Project categories</h2>
            <p>Choose the category that best fits the problem your team wants to solve. You'll select this during registration.</p>
          </div>
          {categories.length === 0 ? (
            <div class="empty-state"><div class="icon">&#128193;</div><h3>Categories coming soon</h3><p>The organizing team hasn't published categories yet.</p></div>
          ) : (
            <div class="grid-3">
              {categories.map((cat) => (
                <div class="card">
                  <div class="icon-badge navy">&#127991;</div>
                  <h3 style="font-size:17px;">{cat.name}</h3>
                  <p style="font-size:14px;">{cat.description || 'Details coming soon.'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  )
})

// ---------------------------------------------------------------- Rules
publicRoutes.get('/rules', async (c) => {
  const s = await getSettings(c.get('db'))
  return c.render(
    <SiteLayout title="Rules & Guidelines" activePath="/rules">
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / Rules &amp; Guidelines</div>
          <h1 style="font-size:34px;">Rules &amp; Guidelines</h1>
          <p style="color:var(--ink-700);">Please read this carefully before registering your team. These guidelines keep the event fair for everyone.</p>

          <h3 style="margin-top:32px;">Eligibility</h3>
          <ul style="padding-left:20px; color:var(--ink-700);">
            <li>Open to students currently enrolled in a recognized college or university.</li>
            <li>Each team must have {s.team_size_min}–{s.team_size_max} members, including the team leader.</li>
            <li>A faculty mentor is required for every team.</li>
          </ul>

          <h3 style="margin-top:26px;">Registration</h3>
          <ul style="padding-left:20px; color:var(--ink-700);">
            <li>Registration closes on {fmt(s.registration_deadline, 'the published deadline')}.</li>
            <li>All information provided during registration must be accurate. Teams found submitting false information may be disqualified.</li>
            <li>Each student may only be part of one team.</li>
          </ul>

          <h3 style="margin-top:26px;">Project Submission</h3>
          <ul style="padding-left:20px; color:var(--ink-700);">
            <li>Projects must be submitted before the project submission deadline unless late submission is enabled by the organizers.</li>
            <li>Submitted work must be original. Plagiarism or misrepresentation of existing tools as new work will lead to disqualification.</li>
            <li>Teams should be ready with a working demo, even if it's an early prototype.</li>
          </ul>

          <h3 style="margin-top:26px;">Evaluation</h3>
          <ul style="padding-left:20px; color:var(--ink-700);">
            <li>Projects are evaluated on innovation, problem relevance, technical implementation, impact, and presentation.</li>
            <li>Evaluator decisions are final.</li>
          </ul>

          <h3 style="margin-top:26px;">Code of Conduct</h3>
          <ul style="padding-left:20px; color:var(--ink-700);">
            <li>Be respectful to fellow participants, evaluators, and organizers.</li>
            <li>Any form of misconduct may result in disqualification from the event.</li>
          </ul>
        </div>
      </section>
    </SiteLayout>
  )
})

// ---------------------------------------------------------------- Schedule
publicRoutes.get('/schedule', async (c) => {
  const s = await getSettings(c.get('db'))
  if (!s.module_schedule_public) {
    return c.render(
      <SiteLayout title="Schedule" activePath="/schedule">
        <section class="section"><div class="container-narrow empty-state"><div class="icon">&#128197;</div><h3>Schedule not published yet</h3><p>Check back closer to the event date.</p></div></section>
      </SiteLayout>
    )
  }
  const items = await c.get('db').many<any>('SELECT * FROM event_schedule ORDER BY sort_order, id')
  return c.render(
    <SiteLayout title="Schedule" activePath="/schedule">
      <section class="section">
        <div class="container-narrow">
          <div class="breadcrumb"><a href="/">Home</a> / Schedule</div>
          <div class="section-head">
            <div class="kicker">Event Day</div>
            <h2>Schedule</h2>
            <p>{fmt(s.event_date, 'Event date to be announced')} · Times are subject to minor changes. Announcements will be posted if anything shifts.</p>
          </div>
          {items.length === 0 ? (
            <div class="empty-state"><div class="icon">&#128197;</div><h3>Schedule coming soon</h3><p>The organizing team hasn't published the schedule yet.</p></div>
          ) : (
            <div class="timeline">
              {items.map((item, i) => (
                <div class={`timeline-item ${i === 0 ? 'current' : ''}`}>
                  <h4>{item.event_time} — {item.title} {item.stage && <span class="tag" style="margin-left:6px;">{item.stage}</span>}</h4>
                  <p>{item.description}</p>
                  {item.location && <p style="font-size:12.5px; margin-top:2px;">&#128205; {item.location}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </SiteLayout>
  )
})

export default publicRoutes
