const crypto = require('crypto')
const { validateHeaderValue } = require('http')
const os = require('os')

const CLIENT_ID_CONFIG_KEY = 'collaborationClientId'
const COLLABORATION_CLIENT_ID_CHANNEL = 'GetCollaborationClientID'
const COLLABORATION_CLIENT_ID_HEADER = 'X-Yakit-Client-ID'
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_HEADER_VALUE_LENGTH = 255
const SAFE_ASCII_HEADER_VALUE_PATTERN = /^[\x20-\x7e]+$/

const normalizeHeaderValue = (value, fallback = 'unknown') => {
  const source = String(value || '')
  if (!source) return fallback
  if (source.length <= MAX_HEADER_VALUE_LENGTH && SAFE_ASCII_HEADER_VALUE_PATTERN.test(source)) {
    return source.trim() || fallback
  }
  return `encoded-${crypto.createHash('sha256').update(source).digest('hex')}`
}

const createCollaborationClientHeaders = ({
  getConfig,
  setConfig,
  createId = crypto.randomUUID,
  hostname = os.hostname,
  platform = process.platform,
  arch = process.arch,
  version,
}) => {
  const config = getConfig()
  let clientId = String(config?.[CLIENT_ID_CONFIG_KEY] || '')
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    clientId = String(createId() || '')
    if (!CLIENT_ID_PATTERN.test(clientId)) throw new Error('invalid_collaboration_client_id')
    if (setConfig(CLIENT_ID_CONFIG_KEY, clientId) !== true) {
      throw new Error('collaboration_client_id_persist_failed')
    }
  }
  const host = normalizeHeaderValue(hostname())
  const headers = {
    [COLLABORATION_CLIENT_ID_HEADER]: clientId,
    'X-Yakit-Device-Name': host,
    'X-Yakit-Hostname': host,
    'X-Yakit-OS': normalizeHeaderValue(`${platform}/${arch}`),
    'X-Yakit-Version': normalizeHeaderValue(version),
  }
  Object.entries(headers).forEach(([name, value]) => validateHeaderValue(name, value))
  return headers
}

const applyCollaborationClientHeaders = (headers, identity) => {
  const target = headers || {}
  Object.entries(identity).forEach(([name, value]) => {
    target[name] = value
  })
  return target
}

const registerCollaborationClientIdentityIPC = ({ ipcMain, assertTrustedAppSender, getCollaborationClientID }) => {
  ipcMain.handle(COLLABORATION_CLIENT_ID_CHANNEL, async (event) => {
    assertTrustedAppSender(event, COLLABORATION_CLIENT_ID_CHANNEL)
    return getCollaborationClientID()
  })
}

const sanitizeRendererConfig = (config) =>
  Object.fromEntries(Object.entries(config || {}).filter(([key]) => key !== CLIENT_ID_CONFIG_KEY))

const setRendererConfig = (setConfig, key, value) => {
  if (key === CLIENT_ID_CONFIG_KEY) return { success: false }
  return { success: setConfig(key, value) }
}

module.exports = {
  COLLABORATION_CLIENT_ID_HEADER,
  applyCollaborationClientHeaders,
  createCollaborationClientHeaders,
  registerCollaborationClientIdentityIPC,
  sanitizeRendererConfig,
  setRendererConfig,
}
