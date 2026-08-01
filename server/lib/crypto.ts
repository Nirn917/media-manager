import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

// APP_MASTER_KEY is the single env-provided secret. We do NOT use it directly
// for cryptography; instead we derive two independent subkeys via HKDF-SHA256.
// This follows the key-separation best practice: one key for AES-GCM, another
// for HMAC. Both derived keys are 32 bytes.
//
// IMPORTANT: changing the derivation scheme invalidates any blobs encrypted or
// signed with the previous raw key. That means:
//   - existing session cookies become invalid (users must log in again)
//   - existing encrypted settings rows become unreadable until re-saved
// Coordinate deployments so users expect a forced re-login, and run the setup
// wizard / Settings page to re-encrypt stored service credentials.
type KeyPurpose = 'encrypt' | 'sign'

function masterKey(): Buffer {
  const raw = process.env.APP_MASTER_KEY
  if (!raw) throw new Error('APP_MASTER_KEY env var is required')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(`APP_MASTER_KEY must decode to 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`)
  }
  return key
}

function deriveKey(purpose: KeyPurpose): Buffer {
  const master = masterKey()
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(purpose), 32))
}

// Encrypted blob format: base64(iv)[:base64(ciphertext)[:base64(authTag)
// All concatenated with '.' -> single portable string for SQLite TEXT column.
export function encrypt(plaintext: string): string {
  const key = deriveKey('encrypt')
  const iv = randomBytes(12) // 96-bit IV is the GCM standard
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), enc.toString('base64'), tag.toString('base64')].join('.')
}

export function decrypt(blob: string): string {
  const key = deriveKey('encrypt')
  const [ivB64, encB64, tagB64] = blob.split('.')
  if (!ivB64 || !encB64 || !tagB64) throw new Error('invalid ciphertext blob')
  const iv = Buffer.from(ivB64, 'base64')
  const enc = Buffer.from(encB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString('utf8')
}

// Sign the auth cookie so tampering is detectable. Truncated HMAC-SHA256.
export function sign(value: string): string {
  const key = deriveKey('sign')
  const mac = createHmac('sha256', key).update(value).digest('base64url')
  return `${value}.${mac}`
}

export function verify(signed: string): string | null {
  if (!signed || !signed.includes('.')) return null
  const idx = signed.lastIndexOf('.')
  const value = signed.slice(0, idx)
  const mac = signed.slice(idx + 1)
  const expected = createHmac('sha256', deriveKey('sign')).update(value).digest('base64url')
  // Constant-time compare.
  if (mac.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  return value
}

// Convenience: encrypt + decrypt an arbitrary JSON object (used for settings rows).
export function encryptJSON(obj: unknown): string {
  return encrypt(JSON.stringify(obj))
}

export function decryptJSON<T = unknown>(blob: string): T {
  return JSON.parse(decrypt(blob)) as T
}