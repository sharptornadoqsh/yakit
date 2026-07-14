const REMOTE_ENGINE_CREDENTIAL_KEY = 'yaklang-remote-engine-credential'
const ENCRYPTED_PASSWORD_FIELD = '__safeStoragePassword'

const isSafeStorageUsable = (safeStorage, platform = process.platform) => {
  try {
    if (!safeStorage?.isEncryptionAvailable?.()) return false
    if (platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false
    return true
  } catch (error) {
    return false
  }
}

const splitCredential = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { password, [ENCRYPTED_PASSWORD_FIELD]: encryptedPassword, ...connection } = value
  return { connection, password, encryptedPassword }
}

const protectLocalCacheValue = (key, value, safeStorage, platform = process.platform) => {
  if (key !== REMOTE_ENGINE_CREDENTIAL_KEY) return value
  const credential = splitCredential(value)
  if (!credential) return value

  const { connection, password, encryptedPassword } = credential
  if (typeof password !== 'string' || password.length === 0) {
    if (typeof encryptedPassword === 'string' && encryptedPassword && isSafeStorageUsable(safeStorage, platform)) {
      return { ...connection, [ENCRYPTED_PASSWORD_FIELD]: encryptedPassword }
    }
    return connection
  }

  if (!isSafeStorageUsable(safeStorage, platform)) return connection
  try {
    return {
      ...connection,
      [ENCRYPTED_PASSWORD_FIELD]: safeStorage.encryptString(password).toString('base64'),
    }
  } catch (error) {
    return connection
  }
}

const revealLocalCacheValue = (key, value, safeStorage, platform = process.platform) => {
  if (key !== REMOTE_ENGINE_CREDENTIAL_KEY) return { value }
  const credential = splitCredential(value)
  if (!credential) return { value }

  const { connection, password, encryptedPassword } = credential
  if (typeof password === 'string') {
    return { value: connection, migratedValue: connection }
  }
  if (typeof encryptedPassword !== 'string' || !encryptedPassword) {
    return { value: connection }
  }
  if (!isSafeStorageUsable(safeStorage, platform)) {
    return { value: connection, migratedValue: connection }
  }

  try {
    return {
      value: {
        ...connection,
        password: safeStorage.decryptString(Buffer.from(encryptedPassword, 'base64')),
      },
    }
  } catch (error) {
    return { value: connection, migratedValue: connection }
  }
}

module.exports = {
  ENCRYPTED_PASSWORD_FIELD,
  REMOTE_ENGINE_CREDENTIAL_KEY,
  isSafeStorageUsable,
  protectLocalCacheValue,
  revealLocalCacheValue,
}
