const net = require('net')

const LOCAL_PORT_ATTEMPTS = 100
const MAX_LOCAL_PORT = 65535
const PORT_CONFLICT_PATTERN = /EADDRINUSE|address already in use|Only one usage of each socket address/i

const isLocalPortConflict = (error) => {
  if (!error) return false
  if (typeof error === 'string') return PORT_CONFLICT_PATTERN.test(error)
  if (error.code === 'EADDRINUSE' || error.status === 'port_occupied') return true
  return PORT_CONFLICT_PATTERN.test([error.message, error.info, ...[].concat(error.reason || [])].join('\n'))
}

const assertLocalPortAvailable = (port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

const runWithLocalPortRetry = async ({ port, operation, onRetry, isCurrent = () => true }) => {
  const initialPort = Number(port)
  if (!Number.isInteger(initialPort) || initialPort < 1 || initialPort > MAX_LOCAL_PORT) {
    throw { status: 'invalid_port', message: `本地引擎端口无效：${port}` }
  }
  const ensureCurrent = () => {
    if (!isCurrent()) throw { status: 'cancelled', message: '本地引擎启动任务已取消' }
  }
  const lastPort = Math.min(initialPort + LOCAL_PORT_ATTEMPTS - 1, MAX_LOCAL_PORT)
  for (let candidate = initialPort; candidate <= lastPort; candidate++) {
    ensureCurrent()
    try {
      const result = await operation(candidate)
      ensureCurrent()
      return { ...result, port: candidate }
    } catch (error) {
      ensureCurrent()
      if (!isLocalPortConflict(error)) throw error
      if (candidate === lastPort) {
        throw {
          status: 'port_occupied',
          message: `本地端口 ${initialPort}–${lastPort} 均被占用，已尝试 ${lastPort - initialPort + 1} 个端口，请释放端口后重试`,
        }
      }
      onRetry?.(candidate, candidate + 1)
    }
  }
}

module.exports = { LOCAL_PORT_ATTEMPTS, isLocalPortConflict, assertLocalPortAvailable, runWithLocalPortRetry }
