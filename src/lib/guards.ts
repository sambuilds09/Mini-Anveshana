import type { Context, Next } from 'hono'
import type { Bindings, Vars } from './types'
import { getUserFromSession } from './auth'

/** Attaches c.get('user') for every request (or null). */
export async function attachUser(c: Context<{ Bindings: Bindings; Variables: Vars }>, next: Next) {
  const user = await getUserFromSession(c)
  c.set('user' as never, user as never)
  await next()
}

export function requireRole(...roles: Array<'student' | 'organizer' | 'evaluator' | 'super_admin'>) {
  return async (c: Context<{ Bindings: Bindings; Variables: Vars }>, next: Next) => {
    const user = c.get('user' as never) as any
    if (!user || !roles.includes(user.role)) {
      const loginPath = roles.includes('organizer') ? '/admin/login' : roles.includes('evaluator') ? '/evaluator/login' : '/student/login'
      return c.redirect(`${loginPath}?next=${encodeURIComponent(c.req.path)}`)
    }
    await next()
  }
}
