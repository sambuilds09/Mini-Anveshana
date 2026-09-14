import postgres, { type Sql } from 'postgres'

export type QueryValues = readonly unknown[]

export type DatabaseResult<T = Record<string, unknown>> = {
  rows: T[]
  rowCount: number
}

export interface PostgresDatabase {
  one<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: QueryValues): Promise<T | null>
  many<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: QueryValues): Promise<T[]>
  execute(text: string, values?: QueryValues): Promise<DatabaseResult>
  transaction<T>(callback: (db: PostgresDatabase) => Promise<T>): Promise<T>
}

type InternalDatabase = PostgresDatabase & {
  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: QueryValues): Promise<DatabaseResult<T>>
}

function toPostgresPlaceholders(text: string): string {
  let index = 0
  let quoted = false
  let result = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "'") {
      if (quoted && text[i + 1] === "'") {
        result += "''"
        i++
        continue
      }
      quoted = !quoted
      result += char
      continue
    }
    if (char === '?' && !quoted) {
      index++
      result += `$${index}`
    } else {
      result += char
    }
  }

  return result.replace(/datetime\('now'\)/gi, 'now()')
}

function createDatabase(sql: Sql<any>): InternalDatabase {
  const database: InternalDatabase = {
    async query<T extends Record<string, unknown>>(text: string, values: QueryValues = []) {
      const rows = await sql.unsafe<T[]>(toPostgresPlaceholders(text), [...values] as any)
      return { rows, rowCount: rows.length }
    },

    async one<T extends Record<string, unknown>>(text: string, values: QueryValues = []): Promise<T | null> {
      const result = await database.query<T>(text, values)
      return (result.rows[0] as T | undefined) || null
    },

    async many<T extends Record<string, unknown>>(text: string, values: QueryValues = []) {
      return (await database.query<T>(text, values)).rows
    },

    async execute(text: string, values: QueryValues = []) {
      return database.query(text, values)
    },

    async transaction<T>(callback: (transactionDb: PostgresDatabase) => Promise<T>) {
      return sql.begin(async (transactionSql) => callback(createDatabase(transactionSql as unknown as Sql<any>))) as Promise<T>
    },

  }

  return database
}

const databaseCache = new Map<string, PostgresDatabase>()

export function getDatabase(databaseUrl: string): PostgresDatabase {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.')
  const cached = databaseCache.get(databaseUrl)
  if (cached) return cached

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  const database = createDatabase(sql)
  databaseCache.set(databaseUrl, database)
  return database
}
