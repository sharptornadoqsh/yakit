const SESSION_PATH = '/__yakit_dev_session__'

const createSessionMiddleware = (env = process.env) => {
  const identity = {
    id: env.YAKIT_DEV_SESSION_ID,
    role: env.YAKIT_DEV_ROLE,
    variant: env.YAKIT_DEV_VARIANT,
    pid: process.pid,
  }
  return (req, res, next) => {
    if (!identity.id) return next()
    res.setHeader('X-Yakit-Dev-Session', identity.id)
    if (req.url !== SESSION_PATH) return next()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(identity))
  }
}

module.exports = { SESSION_PATH, createSessionMiddleware }
