const http = require('http')

const mode = process.argv[2]
const port = Number(process.env.PORT)
const identity = {
  id: process.env.YAKIT_DEV_SESSION_ID,
  role: process.env.YAKIT_DEV_ROLE,
  variant: process.env.YAKIT_DEV_VARIANT,
  pid: process.pid,
}

process.on('disconnect', () => process.exit())
if (mode === 'failure') {
  process.send({ type: 'failure', message: 'fixture startup failure', code: 'EPERM' }, () => process.exit(1))
} else if (mode === 'hang') {
  setInterval(() => {}, 1000)
} else if (mode === 'race' && process.env.YAKIT_DEV_ATTEMPT === '0') {
  const blocker = http.createServer()
  blocker.listen(port, '127.0.0.1', () => {
    const server = http.createServer()
    server.once('error', (error) => {
      process.send({ type: 'failure', message: error.message, code: error.code }, () => {
        blocker.close(() => process.exit(1))
      })
    })
    server.listen(port, '127.0.0.1')
  })
} else {
  const server = http.createServer((req, res) => {
    res.setHeader('X-Yakit-Dev-Session', identity.id)
    res.end(req.url === '/__yakit_dev_session__' ? JSON.stringify(identity) : '<html>renderer</html>')
  })
  server.listen(port, '127.0.0.1', () => process.send({ type: 'listening', port }))
}
