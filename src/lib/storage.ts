import type { Bindings } from './types'

export const STORAGE_BUCKET = 'mini-anveshana-files'

export type StorageObject = {
  body: ReadableStream<Uint8Array>
  contentType: string | null
  contentLength: string | null
}

export type StorageMetadata = {
  contentType: string | null
  contentLength: number | null
}

export class StorageError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'StorageError'
    this.status = status
  }
}

function encodePath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/')
}

function storagePath(projectId: number, type: string, fileName: string): string {
  const safeType = /^(abstract|presentation|image)$/.test(type) ? type : 'other'
  const safeName = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
  return `projects/${projectId}/${safeType}-${Date.now()}-${crypto.randomUUID()}-${safeName}`
}

export function createStoragePath(projectId: number, type: string, fileName: string): string {
  return storagePath(projectId, type, fileName)
}

export function createPendingStoragePath(scope: string, type: string, fileName: string): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '_') || 'uploads'
  const safeType = /^(abstract|presentation|image)$/.test(type) ? type : 'other'
  const safeName = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
  return `pending/${safeScope}/${safeType}-${Date.now()}-${crypto.randomUUID()}-${safeName}`
}

export class SupabaseStorage {
  private readonly baseUrl: string
  private readonly serviceRoleKey: string
  private readonly bucket: string

  constructor(url: string, serviceRoleKey: string, bucket = STORAGE_BUCKET) {
    if (!url) throw new StorageError('SUPABASE_URL is required.', 500)
    if (!serviceRoleKey) throw new StorageError('SUPABASE_SERVICE_ROLE_KEY is required.', 500)
    this.baseUrl = url.replace(/\/$/, '')
    this.serviceRoleKey = serviceRoleKey
    this.bucket = bucket
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('apikey', this.serviceRoleKey)
    headers.set('Authorization', `Bearer ${this.serviceRoleKey}`)
    const response = await fetch(`${this.baseUrl}/storage/v1${path}`, { ...init, headers })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new StorageError(`Supabase Storage request failed (${response.status}).${detail ? ` ${detail.slice(0, 240)}` : ''}`, response.status)
    }
    return response
  }

  async upload(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
    await this.request(`/object/${encodeURIComponent(this.bucket)}/${encodePath(path)}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'x-upsert': 'false',
        'cache-control': '3600',
      },
      body: data,
    })
  }

  async download(path: string): Promise<StorageObject | null> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodePath(path)}`, {
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
    })
    if (response.status === 404) return null
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      if (response.status === 400 && /NoSuchKey|Object not found|not_found/i.test(detail)) return null
      throw new StorageError(`Supabase Storage download failed (${response.status}).${detail ? ` ${detail.slice(0, 240)}` : ''}`, response.status)
    }
    return {
      body: response.body,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    }
  }

  async head(path: string): Promise<StorageMetadata | null> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${encodePath(path)}`, {
      method: 'HEAD',
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
    })
    if (response.status === 404 || response.status === 400) return null
    if (!response.ok) throw new StorageError(`Supabase Storage metadata lookup failed (${response.status}).`, response.status)
    const length = response.headers.get('content-length')
    return {
      contentType: response.headers.get('content-type'),
      contentLength: length ? Number(length) : null,
    }
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.request(`/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    })
  }

  async createSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
    const response = await this.request(`/object/sign/${encodeURIComponent(this.bucket)}/${encodePath(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    })
    const payload = await response.json() as { signedURL?: string }
    if (!payload.signedURL) throw new StorageError('Supabase Storage did not return a signed URL.')
    return payload.signedURL.startsWith('http') ? payload.signedURL : `${this.baseUrl}/storage/v1${payload.signedURL}`
  }

  async createSignedUploadUrl(path: string, expiresInSeconds = 600): Promise<string> {
    const response = await this.request(`/object/upload/sign/${encodeURIComponent(this.bucket)}/${encodePath(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    })
    const payload = await response.json() as { url?: string; token?: string }
    if (!payload.url && !payload.token) throw new StorageError('Supabase Storage did not return a signed upload URL.')
    if (payload.url?.startsWith('http')) return payload.url
    if (payload.url) return `${this.baseUrl}/storage/v1${payload.url}`
    return `${this.baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(this.bucket)}/${encodePath(path)}?token=${encodeURIComponent(payload.token!)}`
  }
}

export function getStorage(bindings: Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>): SupabaseStorage {
  return new SupabaseStorage(bindings.SUPABASE_URL || '', bindings.SUPABASE_SERVICE_ROLE_KEY || '')
}
