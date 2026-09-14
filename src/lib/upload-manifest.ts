import type { SupabaseStorage } from './storage'
import { ALLOWED_DOC_TYPES, ALLOWED_IMAGE_TYPES, MAX_FILES_TOTAL, validateUploadedFile } from './validation'

export type UploadType = 'abstract' | 'presentation' | 'image'

export type UploadManifestItem = {
  type: UploadType
  name: string
  path: string
  contentType: string
  size: number
}

export type ConfirmedUpload = UploadManifestItem & { contentType: string | null }

export function parseUploadManifest(value: unknown): UploadManifestItem[] {
  if (typeof value !== 'string' || !value) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Uploaded file metadata is invalid.')
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_FILES_TOTAL) throw new Error('Too many uploaded files.')
  return parsed.map((item: any) => {
    if (!item || !['abstract', 'presentation', 'image'].includes(item.type) || typeof item.path !== 'string' || typeof item.name !== 'string' || typeof item.contentType !== 'string' || !Number.isInteger(item.size)) {
      throw new Error('Uploaded file metadata is invalid.')
    }
    return {
      type: item.type as UploadType,
      name: item.name,
      path: item.path,
      contentType: item.contentType,
      size: item.size,
    }
  })
}

export async function confirmUploadManifest(storage: SupabaseStorage, items: UploadManifestItem[], requiredPrefix: string): Promise<ConfirmedUpload[]> {
  const confirmed: ConfirmedUpload[] = []
  for (const item of items) {
    if (!item.path.startsWith(requiredPrefix) || item.path.includes('..')) throw new Error('Uploaded file path is invalid.')
    const allowed = item.type === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_DOC_TYPES
    const validationError = validateUploadedFile(item, allowed)
    if (validationError) throw new Error(validationError)
    const metadata = await storage.head(item.path)
    if (!metadata) throw new Error(`Uploaded file "${item.name}" was not found.`)
    if (metadata.contentLength !== null && metadata.contentLength !== item.size) throw new Error(`Uploaded file "${item.name}" size did not match.`)
    if (metadata.contentType && metadata.contentType.split(';')[0] !== item.contentType) throw new Error(`Uploaded file "${item.name}" type did not match.`)
    confirmed.push({ ...item, contentType: metadata.contentType || item.contentType })
  }
  return confirmed
}