export type FieldErrors = Record<string, string>

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export function required(v: unknown, label: string, errors: FieldErrors, key: string) {
  if (v === undefined || v === null || String(v).trim() === '') {
    errors[key] = `${label} is required.`
    return false
  }
  return true
}

export function sanitizeText(v: string | null | undefined, maxLen = 5000): string {
  if (!v) return ''
  return v.toString().trim().slice(0, maxLen)
}

export const ALLOWED_DOC_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
export const MAX_FILES_TOTAL = 6

const FILE_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
}

export function validateUploadedFile(file: { name?: string; type?: string; size: number }, allowedTypes: string[]): string | null {
  if (!file || file.size <= 0) return 'The uploaded file is empty.'
  if (file.size > MAX_FILE_SIZE) return `File "${file.name || 'file'}" exceeds the 10MB limit.`
  if (!file.type || !allowedTypes.includes(file.type)) return `File "${file.name || 'file'}" has an unsupported type.`
  const extension = (file.name || '').toLowerCase().slice((file.name || '').lastIndexOf('.'))
  const allowedExtensions = FILE_EXTENSIONS[file.type] || []
  if (!extension || !allowedExtensions.includes(extension)) return `File "${file.name || 'file'}" has an unsupported extension.`
  return null
}
