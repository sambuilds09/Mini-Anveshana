# Mini Anveshana — Inter-College Student Innovation Event Platform

**"Bring Your Idea. Build Your Solution."**

A full event-management + project-showcase platform for an inter-college innovation event, built with Hono, PostgreSQL, and Supabase Storage.

## What's implemented

**Public site**: Home, About, Categories, Rules, Schedule, Project Showcase (search/filter), Project detail, Results/Leaderboard (hidden until published), Certificate verification, QR verification page.

**Registration**: 7-step wizard (College → Team → Members → Project → Faculty Mentor → Documents → Review) → generates `ANV-YYYY-#####` registration ID, a secure per-team QR token, and a printable event pass with QR.

**Student portal** (`/student/*`): dashboard with journey timeline & status cards, team management (add/remove members, leader-only), project submission (with file uploads, deadline enforcement, late-submission toggle), announcements, schedule, registration pass, certificate download.

**Organizer/Admin console** (`/admin/*`): live dashboard (real DB-driven stats & progress bars), registrations data table (search/filter/bulk approve-reject/CSV export), college & category management, project management, evaluator creation & assignment, evaluation oversight (with reopen), QR check-in scanner (camera + manual entry + offline retry queue), announcements, schedule, results publishing (configurable scoring formula: average/best/sum), certificate generation, analytics (colleges, categories, status, score distribution, registrations over time — all from live queries), settings (event details, module toggles, evaluation criteria), audit log.

**Evaluator portal** (`/evaluator/*`): dashboard, assigned projects list, scoring page (configurable criteria sliders, auto-totalled), comments/strengths/suggestions, lock-after-submit (admin can reopen).

**Security**: PBKDF2 password hashing (Web Crypto, 100k iterations), HttpOnly/Secure session cookies, role-based route guards (student/organizer/evaluator/super_admin), per-role data isolation (students only see their own team; evaluators only see assigned projects), server-side validation & sanitization, file-type/size allowlisting, basic in-memory rate limiting on login endpoints, audit logging of all sensitive admin actions, QR codes carry only an opaque token (no personal data).

**Data**: Supabase PostgreSQL (see `migrations/0001_initial_schema.postgres.sql`), with files in the private `mini-anveshana-files` Supabase Storage bucket. Project images are served publicly through the application route only after the project is approved; registration documents remain organizer-only. The production admin account is created once through `/admin/setup` using the `ADMIN_SETUP_TOKEN` secret; the setup page is disabled after the first organizer account exists. The optional `/api/dev/seed-users` endpoint is development-only and blocked in production.

## Verified end-to-end

- Register team → registration ID issued → QR pass renders → student logs in → dashboard shows correct status.
- Admin logs in → approves team → assigns evaluator to project.
- Evaluator logs in → submits scored evaluation.
- Admin scans QR (check-in API) → team marked checked-in, duplicate-scan detection confirmed.
- Admin recalculates & publishes results → public `/results` shows the project.
- Admin generates certificates → student downloads certificate → `/certificate/verify` confirms it.

## Known gaps / next steps for a real deployment

- Team member email invitations are currently added directly by the leader (accepted immediately) rather than sent as a real email invite — the `invitation_status`/`invitation_token` columns exist for this but the email-send step is not wired to a provider yet.
- Email notifications (registration approved, results published, etc.) are **not yet wired to an actual provider** — add `EMAIL_API_KEY` and a small `notify.ts` service using your chosen provider (Resend/SendGrid/Mailgun) at the points marked in `register.tsx`/`admin-registrations.tsx`.
- `/admin/teams` currently redirects to `/admin/registrations` (same underlying data, kept as a route alias per the spec's route list).
- Rate limiting is in-memory per isolate — fine for a single event weekend, but for stricter protection move to a shared rate-limit service.
- Placeholder event details (`[ADD EVENT DATE]`, `[ADD VENUE]`, etc.) must be filled in via `/admin/settings` before going live — intentionally left as placeholders per the no-invented-data requirement.

## Environment variables (`.env.example`)

```
DATABASE_URL=            # Supabase PostgreSQL connection string
SUPABASE_URL=             # server-side Supabase project URL
SUPABASE_SERVICE_ROLE_KEY= # server-only Storage credential; never expose to clients
EMAIL_API_KEY=           # set when wiring a real email provider
ENVIRONMENT=development  # set to production in deployed environments to disable /api/dev/* seed routes
ADMIN_SETUP_TOKEN=       # one-time secret for /admin/setup
```

## Production Admin Account Setup

The permanent production admin account is created using a secure setup script that hashes the password before storage.

### Create the permanent admin account

```bash
# Using environment variables (recommended for CI/CD):
ADMIN_EMAIL=Admin09 ADMIN_PASSWORD=<password> npx tsx scripts/setup-production-admin.ts

# Using command-line arguments:
npx tsx scripts/setup-production-admin.ts Admin09 <password>
```

**Security notes**:
- The password is never printed, logged, or stored as plaintext
- The password is hashed using PBKDF2-SHA256 (100,000 iterations) before being stored in PostgreSQL
- The script is **idempotent**: if the admin account already exists, it will not create a duplicate
- Do **not** hardcode passwords in source code, Git commits, or .env files
- The credentials should come from a secure source (CI/CD secrets, environment configuration, secure vault)

### Login as admin

After the setup script completes:

1. Navigate to `/admin/login`
2. Enter the Admin ID (e.g., `Admin09`) in the "Admin ID or Email" field
3. Enter the password
4. Click "Log In" to access the admin dashboard

The admin account has full `super_admin` privileges and can:
- Manage registrations and teams
- Configure event settings, schedule, and announcements
- Assign evaluators and review evaluations
- Generate and verify certificates
- Access the complete audit log
- View analytics and performance metrics

## Local development

```bash
npm install
npm run build
pm2 start ecosystem.config.cjs
```

Configure `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the ignored `.env.local` file before starting the app. Run `npx tsx scripts/test-supabase-storage.ts` to verify the private bucket and temporary test-object lifecycle.

**Demo accounts** after seeding (password `Anveshana@123` for all):
- `admin@minianveshana.dev` — super admin (development only)
- `organizer@minianveshana.dev` — organizer (development only)
- `evaluator1@minianveshana.dev`, `evaluator2@minianveshana.dev` — evaluators (development only)

**For local development with the permanent admin account**:
```bash
ADMIN_EMAIL=Admin09 ADMIN_PASSWORD=<dev-password> npx tsx scripts/setup-production-admin.ts
```

Students are created through the normal `/register` flow (no seed needed).

## Deployment

Deployment is intentionally deferred. The live Supabase database uses `migrations/0001_initial_schema.postgres.sql` only; `migrations/0002_seed_dev_data.sql` is development data and must never be applied to production.

Before deployment, create the private `mini-anveshana-files` bucket in Supabase Storage, or run the storage integration test with the server-only Supabase variables configured. Configure `ADMIN_SETUP_TOKEN` as a secret and keep `ENVIRONMENT=production`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code.

**Create the permanent admin account** before or immediately after deployment:

```bash
ADMIN_EMAIL=Admin09 ADMIN_PASSWORD=<secure-password> npx tsx scripts/setup-production-admin.ts
```

The password should come from a secure source (CI/CD secrets, password manager, secure vault) and should never be hardcoded in source files.

After Supabase Storage, admin account, and secrets are configured, run the build and regression checks manually:

```bash
npm install
npm run build
npx tsx scripts/test-postgres-integration.ts
npx tsx scripts/test-supabase-storage.ts
```
