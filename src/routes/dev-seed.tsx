import { Hono } from 'hono'
import type { Bindings, Vars } from '../lib/types'
import { hashPassword } from '../lib/auth'

// Development-only seed route. Creates demo accounts for local testing.
// This must NEVER be reachable in production — gated by ENVIRONMENT binding.
const devSeed = new Hono<{ Bindings: Bindings; Variables: Vars }>()

devSeed.post('/api/dev/seed-users', async (c) => {
  if (c.env.ENVIRONMENT === 'production') return c.json({ error: 'Not available in production.' }, 403)

  const demoPassword = 'Anveshana@123'
  const hash = await hashPassword(demoPassword)
  const db = c.get('db')

  const accounts = [
    { email: 'admin@minianveshana.dev', name: 'Event Organizer', role: 'super_admin' },
    { email: 'organizer@minianveshana.dev', name: 'Organizer Two', role: 'organizer' },
    { email: 'evaluator1@minianveshana.dev', name: 'Dr. Kavya Nair', role: 'evaluator' },
    { email: 'evaluator2@minianveshana.dev', name: 'Prof. Sanjay Iyer', role: 'evaluator' },
  ]

  const created: string[] = []
  for (const acc of accounts) {
    const existing = await db.one<any>('SELECT id FROM users WHERE email = ?', [acc.email])
    if (existing) continue
    const user = await db.one<{ id: number }>('INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?) RETURNING id', [acc.email, hash, acc.name, acc.role])
    if (acc.role === 'evaluator') {
      await db.execute('INSERT INTO evaluators (user_id, organization, expertise) VALUES (?,?,?)', [user!.id, 'Mini Anveshana Panel', 'General'])
    }
    created.push(acc.email)
  }

  return c.json({ message: 'Dev accounts ready. Password for all: ' + demoPassword, created, accounts: accounts.map((a) => ({ email: a.email, role: a.role })) })
})

export default devSeed
