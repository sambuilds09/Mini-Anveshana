import type { PostgresDatabase } from './db'

export type Bindings = {
  DATABASE_URL?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  ENVIRONMENT?: string
  ADMIN_SETUP_TOKEN?: string
}

export type AppUser = {
  id: number
  email: string
  full_name: string
  role: 'student' | 'organizer' | 'evaluator' | 'super_admin'
  is_active: number
}

export type Vars = {
  db: PostgresDatabase
  user: AppUser | null
}
