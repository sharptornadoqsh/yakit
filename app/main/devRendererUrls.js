const DEFAULT_URLS = {
  main: 'http://127.0.0.1:3000',
  startup: 'http://127.0.0.1:5173',
}

const getDevRendererUrl = (role = 'main', suffix = '') => {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_URLS, role)) throw new Error('未知的开发页面')
  const key = role === 'main' ? 'YAKIT_DEV_MAIN_URL' : 'YAKIT_DEV_STARTUP_URL'
  const parsed = new URL(process.env[key] || DEFAULT_URLS[role])
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('开发页面地址必须是明确的本机 HTTP 来源')
  }
  if (suffix && (!suffix.startsWith('/') || suffix.startsWith('//'))) {
    throw new Error('开发页面路径必须以单个斜杠开头')
  }
  return `${parsed.origin}${suffix}`
}

const getDevRendererOrigins = () => [getDevRendererUrl('main'), getDevRendererUrl('startup')]

module.exports = { getDevRendererUrl, getDevRendererOrigins }
