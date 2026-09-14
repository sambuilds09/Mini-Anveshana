import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStorage, STORAGE_BUCKET } from '../src/lib/storage'
import { ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, validateUploadedFile } from '../src/lib/validation'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const state: Record<string, { pass: boolean; error?: string }> = {}

function parseDotEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf8')
  const result: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    result[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return result
}

function getConfig(): { url: string; serviceRoleKey: string } {
  const localPath = path.join(projectRoot, '.env.local')
  const local = fs.existsSync(localPath) ? parseDotEnvFile(localPath) : {}
  const url = process.env.SUPABASE_URL || local.SUPABASE_URL || ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in .env.local or process.env.')
  }
  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

async function mark(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    state[name] = { pass: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state[name] = { pass: false, error: message }
    console.error(`FAIL :: ${name} :: ${message}`)
  }
}

async function main() {
  const config = getConfig()
  const storage = getStorage({ SUPABASE_URL: config.url, SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey })
  const authHeaders = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  }
  const bucketUrl = `${config.url}/storage/v1/bucket/${encodeURIComponent(STORAGE_BUCKET)}`
  const objectBaseUrl = `${config.url}/storage/v1/object`
  const suffix = `${Date.now()}-${crypto.randomUUID()}`
  const objectPath = `integration-tests/${suffix}/sample.png`
  const signedObjectPath = `integration-tests/${suffix}/signed-sample.png`
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  try {
    await mark('SUPABASE STORAGE SETUP', async () => {
      const create = await fetch(`${config.url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: STORAGE_BUCKET,
          name: STORAGE_BUCKET,
          public: false,
          file_size_limit: MAX_FILE_SIZE,
          allowed_mime_types: [...ALLOWED_DOC_TYPES, ...ALLOWED_IMAGE_TYPES],
        }),
      })
      if (!create.ok && create.status !== 400 && create.status !== 409) {
        throw new Error(`Bucket creation failed with status ${create.status}.`)
      }
      const details = await fetch(bucketUrl, { headers: authHeaders })
      if (!details.ok) throw new Error(`Bucket metadata lookup failed with status ${details.status}.`)
      const bucket = await details.json() as { public?: boolean; file_size_limit?: number }
      if (bucket.public !== false) throw new Error('The storage bucket is public; sensitive documents require a private bucket.')
      if (bucket.file_size_limit && bucket.file_size_limit < MAX_FILE_SIZE) throw new Error('The storage bucket limit is lower than the application file limit.')
    })

    await mark('FILE VALIDATION', () => {
      const valid = validateUploadedFile({ name: 'sample.png', type: 'image/png', size: bytes.byteLength }, ALLOWED_IMAGE_TYPES)
      if (valid) throw new Error(valid)
      const invalidType = validateUploadedFile({ name: 'sample.exe', type: 'application/octet-stream', size: 10 }, ALLOWED_IMAGE_TYPES)
      if (!invalidType) throw new Error('A disallowed MIME type was accepted.')
      const invalidSize = validateUploadedFile({ name: 'sample.png', type: 'image/png', size: MAX_FILE_SIZE + 1 }, ALLOWED_IMAGE_TYPES)
      if (!invalidSize) throw new Error('An oversized file was accepted.')
      const invalidExtension = validateUploadedFile({ name: 'sample.jpg', type: 'image/png', size: 10 }, ALLOWED_IMAGE_TYPES)
      if (!invalidExtension) throw new Error('A mismatched extension was accepted.')
    })

    await mark('SIGNED UPLOAD', async () => {
      const signedUrl = await storage.createSignedUploadUrl(signedObjectPath)
      const response = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes })
      if (!response.ok) throw new Error(`Signed upload failed with status ${response.status}.`)
      const metadata = await storage.head(signedObjectPath)
      if (!metadata || metadata.contentLength !== bytes.byteLength) throw new Error('Signed upload metadata was not persisted.')
    })

    await mark('UPLOAD', async () => {
      await storage.upload(objectPath, bytes.buffer, 'image/png')
    })

    await mark('DOWNLOAD/READ', async () => {
      const object = await storage.download(objectPath)
      if (!object) throw new Error('Uploaded object could not be downloaded.')
      const received = new Uint8Array(await new Response(object.body).arrayBuffer())
      if (received.length !== bytes.length || received.some((value, index) => value !== bytes[index])) {
        throw new Error('Downloaded bytes did not match the uploaded bytes.')
      }
      if (object.contentType !== 'image/png') throw new Error(`Expected image/png metadata, got ${object.contentType || 'none'}.`)
    })

    await mark('METADATA/PATH', async () => {
      const list = await fetch(`${objectBaseUrl}/list/${encodeURIComponent(STORAGE_BUCKET)}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: `integration-tests/${suffix}`, limit: 10 }),
      })
      if (!list.ok) throw new Error(`Object listing failed with status ${list.status}.`)
      const objects = await list.json() as Array<{ name?: string; metadata?: { mimetype?: string } }>
      const match = objects.find((object) => object.name === 'sample.png')
      if (!match) throw new Error('Uploaded object path was not returned by Storage metadata listing.')
      if (match.metadata?.mimetype && match.metadata.mimetype !== 'image/png') throw new Error('Stored MIME metadata did not match the upload.')
    })

    await mark('PRIVATE FILE SECURITY', async () => {
      const publicResponse = await fetch(`${objectBaseUrl}/public/${encodeURIComponent(STORAGE_BUCKET)}/${objectPath}`)
      if (publicResponse.ok) throw new Error('Private test object was publicly readable.')
      if (![400, 401, 403, 404].includes(publicResponse.status)) throw new Error(`Unexpected public access status ${publicResponse.status}.`)
    })

    await mark('AUTHORIZED ACCESS', async () => {
      const object = await storage.download(objectPath)
      if (!object) throw new Error('Server-side authorized storage access failed.')
    })

    await mark('UNAUTHORIZED ACCESS', async () => {
      const response = await fetch(`${objectBaseUrl}/${encodeURIComponent(STORAGE_BUCKET)}/${objectPath}`)
      if (response.ok) throw new Error('Unauthenticated storage read unexpectedly succeeded.')
      if (![400, 401, 403, 404].includes(response.status)) throw new Error(`Unexpected unauthenticated access status ${response.status}.`)
    })
  } finally {
    await mark('DELETE/CLEANUP', async () => {
      await storage.remove([objectPath, signedObjectPath])
      const remaining = await storage.download(objectPath)
      const remainingSigned = await storage.download(signedObjectPath)
      if (remaining || remainingSigned) throw new Error('Temporary storage object still exists after deletion.')
    })
  }

  const allPass = Object.values(state).every((entry) => entry.pass)
  console.log('SUPABASE STORAGE INTEGRATION TEST REPORT')
  console.log('----------------------------------------')
  for (const [name, result] of Object.entries(state)) console.log(`${name}: ${result.pass ? 'PASS' : 'FAIL'}`)
  console.log(`FINAL RESULT: ${allPass ? 'PASS' : 'FAIL'}`)
  if (!allPass) process.exitCode = 1
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`STORAGE TEST BLOCKED :: ${message}`)
  process.exitCode = 2
})
