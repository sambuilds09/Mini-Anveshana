import type { AppUser } from './types'
import type { PostgresDatabase } from './db'

export type TeamRow = {
  id: number
  registration_id: string
  team_name: string
  college_id: number
  college_name?: string
  department: string | null
  leader_user_id: number | null
  leader_name: string
  leader_email: string
  leader_usn: string | null
  leader_phone: string | null
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
  rejection_reason: string | null
  qr_token: string
  checked_in: number
  checked_in_at: string | null
  consent_confirmed: number
  created_at: string
  updated_at: string
}

/** Finds the team a logged-in student belongs to — either as leader or as an accepted member. */
export async function getTeamForUser(db: PostgresDatabase, userId: number): Promise<TeamRow | null> {
  const asLeader = await db.one<TeamRow>(
    `SELECT t.*, c.name as college_name FROM teams t JOIN colleges c ON c.id = t.college_id WHERE t.leader_user_id = ?`,
    [userId]
  )
  if (asLeader) return asLeader

  const asMember = await db.one<TeamRow>(
      `SELECT t.*, c.name as college_name FROM teams t
       JOIN colleges c ON c.id = t.college_id
       JOIN team_members m ON m.team_id = t.id
       WHERE m.user_id = ? AND m.invitation_status = 'accepted'`
    , [userId]
  )
  return asMember || null
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved':
    case 'completed':
    case 'success':
    case 'checked_in':
    case 'accepted':
      return 'badge-success'
    case 'rejected':
    case 'declined':
    case 'invalid':
      return 'badge-danger'
    case 'under_review':
    case 'in_progress':
    case 'pending':
      return 'badge-warn'
    case 'submitted':
    case 'reviewed':
    case 'draft':
      return 'badge-info'
    default:
      return 'badge-neutral'
  }
}

export function fmtStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Computes a project's final score from all completed evaluations, per the configured formula. */
export async function computeProjectScore(db: PostgresDatabase, projectId: number, formula: string): Promise<number | null> {
  const rows = await db.many<{ total_score: number }>(
    `SELECT total_score FROM evaluations WHERE project_id = ? AND status = 'completed' AND total_score IS NOT NULL`,
    [projectId]
  )
  const scores = rows.map((r) => r.total_score)
  if (scores.length === 0) return null
  if (formula === 'best') return Math.max(...scores)
  if (formula === 'sum') return scores.reduce((a, b) => a + b, 0)
  return scores.reduce((a, b) => a + b, 0) / scores.length // average (default)
}
