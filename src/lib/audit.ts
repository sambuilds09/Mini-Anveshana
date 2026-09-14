import type { PostgresDatabase } from './db'

export async function logAudit(
  db: PostgresDatabase,
  userId: number | null,
  action: string,
  targetType?: string,
  targetId?: string | number,
  details?: string
) {
  await db.execute(
    'INSERT INTO audit_logs (user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, targetType || null, targetId != null ? String(targetId) : null, details || null]
  )
}
