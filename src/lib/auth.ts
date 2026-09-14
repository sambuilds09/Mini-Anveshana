import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { PostgresDatabase } from './db'
import type { Bindings, Vars, AppUser } from './types'

const SESSION_COOKIE = 'anv_session'
const SESSION_TTL_HOURS = 24 * 7 // 7 days

function toHex(buffer: ArrayBuffer | ArrayBufferView): string {
  return Array.from(new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/** PBKDF2-SHA256 password hashing (Web Crypto — works on Cloudflare Workers). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return `${toHex(salt)}:${toHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = fromHex(saltHex)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256)
  const computed = toHex(bits)
  // constant-time-ish comparison
  if (computed.length !== hashHex.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ hashHex.charCodeAt(i)
  return diff === 0
}

export function randomToken(bytes = 24): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer)
}

export async function createSession(db: PostgresDatabase, userId: number): Promise<string> {
  const id = randomToken(32)
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString()
  await db.execute('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [id, userId, expires])
  return id
}

export async function destroySession(db: PostgresDatabase, sessionId: string) {
  await db.execute('DELETE FROM sessions WHERE id = ?', [sessionId])
}

export function setSessionCookie(c: Context, sessionId: string) {
  const requestUrl = new URL(c.req.url)
  const forwardedProto = c.req.header('x-forwarded-proto')
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: requestUrl.protocol === 'https:' || forwardedProto === 'https',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600,
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export async function getUserFromSession(c: Context<{ Bindings: Bindings; Variables: Vars }>): Promise<AppUser | null> {
  const sid = getCookie(c, SESSION_COOKIE)
  if (!sid) return null
  const row = await c.get('db').one<AppUser>(
    `SELECT u.id, u.email, u.full_name, u.role, u.is_active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > now()`,
    [sid]
  )
  if (!row || row.is_active === 0) return null
  return row
}

export function getSessionCookieValue(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE)
}
