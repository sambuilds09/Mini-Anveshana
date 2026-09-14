import type { PostgresDatabase } from './db'

export type EventSettings = {
  id: number
  event_name: string
  tagline: string
  event_date: string | null
  venue: string | null
  registration_deadline: string | null
  project_deadline: string | null
  team_size_min: number
  team_size_max: number
  contact_email: string | null
  registration_open: number
  late_submission_allowed: number
  results_published: number
  certificates_enabled: number
  module_projects_public: number
  module_schedule_public: number
  scoring_formula: string
  home_description: string | null
  hero_text: string | null
  home_highlights: string | null
  rules_eligibility: string | null
  rules_registration: string | null
  rules_projects: string | null
  rules_submission: string | null
  rules_evaluation: string | null
  rules_general: string | null
  updated_at: string
}

export async function getSettings(db: PostgresDatabase): Promise<EventSettings> {
  const row = await db.one<EventSettings>('SELECT * FROM event_settings WHERE id = 1')
  return row as EventSettings
}

export function fmt(value: string | null | undefined, placeholder: string): string {
  return value && value.trim() ? value : placeholder
}
