/**
 * Maintenance script to fix Admin09 email case normalization.
 * 
 * This script updates the existing Admin09 account from "Admin09" (if stored with capital A)
 * to "admin09" (lowercase) to match the login handler's case-normalization logic.
 * 
 * Usage:
 *   npx tsx scripts/fix-admin-email-case.ts
 * 
 * This is a one-time fix for the case sensitivity mismatch between setup script and login handler.
 */

import { getDatabase, type PostgresDatabase } from '../src/lib/db'

const DATABASE_URL = process.env.DATABASE_URL

// Validate DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.')
  process.exit(1)
}

async function fixAdminEmailCase(): Promise<void> {
  console.log('🔧 Fixing Admin09 email case normalization...\n')

  let db: PostgresDatabase
  try {
    db = await getDatabase(DATABASE_URL)
    console.log('✅ Connected to PostgreSQL database')
  } catch (err: any) {
    console.error('❌ Failed to connect:', err.message)
    process.exit(1)
  }

  try {
    // Find any admin account with Admin09 (case-insensitive)
    const existing = await db.one<{ id: number; email: string }>(
      `SELECT id, email FROM users WHERE LOWER(email) = 'admin09' AND role IN ('organizer', 'super_admin')`
    )

    if (!existing) {
      console.log('ℹ️  No Admin09 account found.')
      process.exit(0)
    }

    if (existing.email === 'admin09') {
      console.log('✅ Admin09 email is already normalized to lowercase.')
      process.exit(0)
    }

    // Update to lowercase
    console.log(`📝 Normalizing email from "${existing.email}" to "admin09"...`)
    await db.execute('UPDATE users SET email = ? WHERE id = ?', ['admin09', existing.id])
    console.log('✅ Email normalized successfully\n')

    // Verify
    const updated = await db.one<{ email: string }>(
      `SELECT email FROM users WHERE id = ?`,
      [existing.id]
    )
    console.log(`✅ Verification: Admin09 email is now "${updated?.email}"`)
    console.log('\n🎉 Admin09 email normalization complete!')
    process.exit(0)
  } catch (err: any) {
    console.error('❌ Fix failed:', err.message)
    process.exit(1)
  }
}

fixAdminEmailCase().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
