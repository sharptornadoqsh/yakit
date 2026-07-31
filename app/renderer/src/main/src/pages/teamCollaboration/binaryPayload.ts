export const MAX_SHARED_RECORD_CONTENT_BYTES = 20 * 1024 * 1024

export interface SharedBytesPayload {
  raw_base64: string
  byte_length: number
  sha256: string
}

export class SharedRecordError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SharedRecordError'
    this.code = code
  }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export const encodeBase64 = (bytes: Uint8Array): string => {
  let result = ''
  const chunks: string[] = []

  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index]
    const hasSecond = index + 1 < bytes.byteLength
    const hasThird = index + 2 < bytes.byteLength
    const second = hasSecond ? bytes[index + 1] : 0
    const third = hasThird ? bytes[index + 2] : 0

    result += BASE64_ALPHABET[first >> 2]
    result += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)]
    result += hasSecond ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)] : '='
    result += hasThird ? BASE64_ALPHABET[third & 0x3f] : '='

    if (result.length >= 32 * 1024) {
      chunks.push(result)
      result = ''
    }
  }

  chunks.push(result)
  return chunks.join('')
}

export const encodeBytes = encodeBase64

export const decodeBase64Strict = (value: string): Uint8Array => {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw new SharedRecordError('invalid_shared_record_base64', '共享记录包含无效 Base64')
  }

  let decoded: string
  try {
    decoded = atob(value)
  } catch {
    throw new SharedRecordError('invalid_shared_record_base64', '共享记录包含无效 Base64')
  }

  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  if (encodeBase64(bytes) !== value) {
    throw new SharedRecordError('invalid_shared_record_base64', '共享记录包含非规范 Base64')
  }
  return bytes
}

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  let result = ''
  for (const byte of digest) result += byte.toString(16).padStart(2, '0')
  return result
}

export const createSharedBytesPayload = async (bytes: Uint8Array): Promise<SharedBytesPayload> => ({
  raw_base64: encodeBase64(bytes),
  byte_length: bytes.byteLength,
  sha256: await sha256Hex(bytes),
})

const asSharedBytesPayload = (value: unknown): SharedBytesPayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SharedRecordError('invalid_shared_record_payload', '共享记录二进制描述无效')
  }
  const payload = value as Partial<SharedBytesPayload>
  if (
    typeof payload.raw_base64 !== 'string' ||
    typeof payload.byte_length !== 'number' ||
    !Number.isSafeInteger(payload.byte_length) ||
    payload.byte_length < 0 ||
    typeof payload.sha256 !== 'string' ||
    !SHA256_PATTERN.test(payload.sha256)
  ) {
    throw new SharedRecordError('invalid_shared_record_payload', '共享记录二进制描述无效')
  }
  return payload as SharedBytesPayload
}

export const verifySharedBytesPayload = async (value: unknown): Promise<Uint8Array> => {
  const payload = asSharedBytesPayload(value)
  const bytes = decodeBase64Strict(payload.raw_base64)
  if (bytes.byteLength !== payload.byte_length) {
    throw new SharedRecordError('shared_record_byte_length_mismatch', '共享记录字节长度不匹配')
  }
  if ((await sha256Hex(bytes)) !== payload.sha256) {
    throw new SharedRecordError('shared_record_sha256_mismatch', '共享记录哈希不匹配')
  }
  return bytes
}

export const decodeAndVerifyBytes = (rawBase64: string, byteLength: number, digest: string): Promise<Uint8Array> =>
  verifySharedBytesPayload({
    raw_base64: rawBase64,
    byte_length: byteLength,
    sha256: digest,
  })

export const assertSharedRecordContentSize = (content: string): void => {
  if (typeof content !== 'string') {
    throw new SharedRecordError('invalid_shared_record_content', '共享记录正文必须是字符串')
  }
  if (new TextEncoder().encode(content).byteLength > MAX_SHARED_RECORD_CONTENT_BYTES) {
    throw new SharedRecordError('shared_record_payload_too_large', '共享记录正文超过 20 MiB 限制')
  }
}
