import { randomToken } from './auth'
import type { PostgresDatabase } from './db'

/** Generates the next readable registration ID, e.g. ANV26-00001. */
export async function nextRegistrationId(db: PostgresDatabase, year: number): Promise<string> {
  const prefix = `ANV${String(year).slice(-2)}-`
  const row = await db.one<{ registration_id: string }>(
    `SELECT registration_id FROM teams WHERE registration_id LIKE ? ORDER BY registration_id DESC LIMIT 1 FOR UPDATE`,
    [`${prefix}%`]
  )
  let next = 1
  if (row?.registration_id) {
    const n = parseInt(row.registration_id.split('-').pop() || '0', 10)
    next = n + 1
  }
  return `${prefix}${String(next).padStart(5, '0')}`
}

/** Generates the next certificate ID, e.g. MA26-CERT-000123 */
export async function nextCertificateId(db: PostgresDatabase, yearShort: string): Promise<string> {
  const prefix = `MA${yearShort}-CERT-`
  const row = await db.one<{ certificate_id: string }>(
    `SELECT certificate_id FROM certificates WHERE certificate_id LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  )
  let next = 1
  if (row?.certificate_id) {
    const n = parseInt(row.certificate_id.split('-').pop() || '0', 10)
    next = n + 1
  }
  return `${prefix}${String(next).padStart(6, '0')}`
}

export function newQrToken(): string {
  return 'QR' + randomToken(20)
}
