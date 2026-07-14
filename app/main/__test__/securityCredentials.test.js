import { describe, expect, it, vi } from 'vitest'
import {
  ENCRYPTED_PASSWORD_FIELD,
  REMOTE_ENGINE_CREDENTIAL_KEY,
  isSafeStorageUsable,
  protectLocalCacheValue,
  revealLocalCacheValue,
} from '../securityCredentials'

const createSafeStorage = () => ({
  isEncryptionAvailable: vi.fn(() => true),
  getSelectedStorageBackend: vi.fn(() => 'dpapi'),
  encryptString: vi.fn(() => Buffer.from('ciphertext')),
  decryptString: vi.fn(() => 'RemotePass1!'),
})

describe('securityCredentials', () => {
  it('encrypts and restores a remote engine password', () => {
    const safeStorage = createSafeStorage()
    const protectedValue = protectLocalCacheValue(
      REMOTE_ENGINE_CREDENTIAL_KEY,
      { host: '127.0.0.1', port: '8087', password: 'RemotePass1!' },
      safeStorage,
      'win32',
    )

    expect(protectedValue).toEqual({
      host: '127.0.0.1',
      port: '8087',
      [ENCRYPTED_PASSWORD_FIELD]: Buffer.from('ciphertext').toString('base64'),
    })
    expect(JSON.stringify(protectedValue)).not.toContain('RemotePass1!')
    expect(revealLocalCacheValue(REMOTE_ENGINE_CREDENTIAL_KEY, protectedValue, safeStorage, 'win32')).toEqual({
      value: { host: '127.0.0.1', port: '8087', password: 'RemotePass1!' },
    })
  })

  it('does not persist a password when encryption is unavailable', () => {
    const safeStorage = createSafeStorage()
    safeStorage.isEncryptionAvailable.mockReturnValue(false)

    expect(
      protectLocalCacheValue(
        REMOTE_ENGINE_CREDENTIAL_KEY,
        { host: 'remote.example', password: 'RemotePass1!' },
        safeStorage,
        'win32',
      ),
    ).toEqual({ host: 'remote.example' })
  })

  it('rejects the Linux basic text backend', () => {
    const safeStorage = createSafeStorage()
    safeStorage.getSelectedStorageBackend.mockReturnValue('basic_text')

    expect(isSafeStorageUsable(safeStorage, 'linux')).toBe(false)
  })

  it('removes a legacy plaintext password during read', () => {
    const safeStorage = createSafeStorage()
    const connection = { host: 'remote.example', port: '8087' }

    expect(
      revealLocalCacheValue(
        REMOTE_ENGINE_CREDENTIAL_KEY,
        { ...connection, password: 'LegacyPass1!' },
        safeStorage,
        'win32',
      ),
    ).toEqual({ value: connection, migratedValue: connection })
  })

  it('removes an encrypted value that cannot be decrypted', () => {
    const safeStorage = createSafeStorage()
    safeStorage.decryptString.mockImplementation(() => {
      throw new Error('decrypt failed')
    })
    const connection = { host: 'remote.example', port: '8087' }

    expect(
      revealLocalCacheValue(
        REMOTE_ENGINE_CREDENTIAL_KEY,
        { ...connection, [ENCRYPTED_PASSWORD_FIELD]: 'invalid' },
        safeStorage,
        'win32',
      ),
    ).toEqual({ value: connection, migratedValue: connection })
  })

  it('leaves unrelated cache values unchanged', () => {
    const safeStorage = createSafeStorage()
    const value = { password: 'not-a-remote-engine-credential' }

    expect(protectLocalCacheValue('other-key', value, safeStorage, 'win32')).toBe(value)
  })
})
