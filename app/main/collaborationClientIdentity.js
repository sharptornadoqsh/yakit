const crypto = require('crypto')
const os = require('os')

const CLIENT_ID_CONFIG_KEY = 'collaborationClientId'
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

const normalizeHeaderValue = (value, fallback = 'unknown') => {
  const normalized = String(value || '')
    .replace(/[\r\n]/g, '')
    .trim()
    .slice(0, 255)
  return normalized || fallback
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
  let clientId = normalizeHeaderValue(config?.[CLIENT_ID_CONFIG_KEY], '')
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    clientId = createId()
    setConfig(CLIENT_ID_CONFIG_KEY, clientId)
  }
  const host = normalizeHeaderValue(hostname())
  return {
    'X-Yakit-Client-ID': clientId,
    'X-Yakit-Device-Name': host,
    'X-Yakit-Hostname': host,
    'X-Yakit-OS': normalizeHeaderValue(`${platform}/${arch}`),
    'X-Yakit-Version': normalizeHeaderValue(version),
  }
}

const applyCollaborationClientHeaders = (headers, identity) => {
  const target = headers || {}
  Object.entries(identity).forEach(([name, value]) => {
    target[name] = value
  })
  return target
}

module.exports = {
  applyCollaborationClientHeaders,
  createCollaborationClientHeaders,
}
