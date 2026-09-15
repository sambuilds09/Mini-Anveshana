/**
 * Setup script for permanent production admin account.
 * 
 * Usage:
 *   ADMIN_EMAIL=Admin09 ADMIN_PASSWORD=<password> npx tsx scripts/setup-production-admin.ts
 * 
 * Or pass as command-line arguments:
 *   npx tsx scripts/setup-production-admin.ts Admin09 <password>
 * 
 * This script creates a permanent admin account with full super_admin privileges.
 * Credentials are securely hashed before storage in PostgreSQL.
 * 
 * SECURITY NOTES:
 * - Password is never printed, logged, or exposed to terminal or browser
 * - Credentials come from environment variables or CLI args, never from Git
 * - The password hash is stored in PostgreSQL using PBKDF2-SHA256 (100k iterations)
 * - Do NOT commit the actual password to Git or .env files
 */

import { getDatabase, type PostgresDatabase } from '../src/lib/db'

// ============================================================================
// Read Credentials from Environment or CLI Arguments
// ============================================================================

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || process.argv[2])?.toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.argv[3]
const ADMIN_FULL_NAME = 'Production Admin'
const DATABASE_URL = process.env.DATABASE_URL

// Validate credentials were provided
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Error: Credentials not provided.')
  console.error('\nUsage:')
  console.error('  ADMIN_EMAIL=Admin09 ADMIN_PASSWORD=<password> npx tsx scripts/setup-production-admin.ts')
  console.error('\nOr:')
  console.error('  npx tsx scripts/setup-production-admin.ts Admin09 <password>')
  console.error('\nSECURITY: Do not hardcode passwords in source code or .env files.')
  process.exit(1)
}

// Validate DATABASE_URL was provided
if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.')
  console.error('\nPlease configure the PostgreSQL connection in your environment:')
  console.error('  export DATABASE_URL="postgresql://..."')
  console.error('\nOr configure .env.local with the DATABASE_URL.')
  process.exit(1)
}

// ============================================================================
// PBKDF2 Password Hashing (matches src/lib/auth.ts)
// ============================================================================

function toHex(buffer: ArrayBuffer | ArrayBufferView): string {
  return Array.from(new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return `${toHex(salt)}:${toHex(bits)}`
}

// ============================================================================
// Main Setup Logic
// ============================================================================

async function setupProductionAdmin(): Promise<void> {
  console.log('🔐 Setting up production admin account...\n')

  // Connect to database
  let db: PostgresDatabase
  try {
    db = await getDatabase(DATABASE_URL)
    console.log('✅ Connected to PostgreSQL database')
  } catch (err: any) {
    console.error('❌ Failed to connect to database:', err.message)
    process.exit(1)
  }

  try {
    // Check if admin already exists (idempotency) - case-insensitive match
    const existing = await db.one<{ id: number }>(
      `SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND role IN ('organizer', 'super_admin')`,
      [ADMIN_EMAIL]
    )

    if (existing) {
      console.log(`⚠️  Admin account '${ADMIN_EMAIL}' already exists.`)
      console.log('   Skipping creation (idempotent). No changes made.')
      process.exit(0)
    }

    // Hash the password using PBKDF2-SHA256
    console.log('🔑 Hashing password with PBKDF2-SHA256 (100k iterations)...')
    const passwordHash = await hashPassword(ADMIN_PASSWORD)
    console.log('✅ Password hashed securely')

    // Insert admin user into database
    console.log(`📝 Creating admin account: '${ADMIN_EMAIL}'`)
    await db.execute(
      `INSERT INTO users (email, password_hash, full_name, role, is_active) 
       VALUES (?, ?, ?, 'super_admin', 1)`,
      [ADMIN_EMAIL, passwordHash, ADMIN_FULL_NAME]
    )
    console.log('✅ Admin account created successfully\n')

    // Verify creation
    const created = await db.one<{ id: number; role: string }>(
      `SELECT id, role FROM users WHERE email = ?`,
      [ADMIN_EMAIL]
    )

    if (created) {
      console.log(`✅ Verification passed:`)
      console.log(`   • Admin ID: ${ADMIN_EMAIL}`)
      console.log(`   • Role: ${created.role}`)
      console.log(`   • User ID in database: ${created.id}`)
      console.log(`   • Account is active and ready to use\n`)
      console.log(`🎉 Admin account setup complete!`)
      console.log(`   Login at: /admin/login`)
      console.log(`   Admin ID: ${ADMIN_EMAIL}`)
      console.log(`   Password: [configured securely - never stored in plaintext]\n`)
    }

    process.exit(0)
  } catch (err: any) {
    console.error('❌ Setup failed:', err.message)
    if (err.message?.includes('UNIQUE constraint')) {
      console.error('   The account may already exist. Try logging in instead.')
    }
    process.exit(1)
  }
}

// ============================================================================
// Execute Setup
// ============================================================================

setupProductionAdmin().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
