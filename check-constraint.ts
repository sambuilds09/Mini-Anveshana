import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)

const result = await sql.unsafe(
  "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'teams_status_check'"
)

console.log(result)

await sql.end()
