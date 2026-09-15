const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { createSessionMiddleware } = require('./dev-session')

let server
const fail = (error) => {
  console.error(error)
  const code = error.code || (/^Port \d+ is already in use/.test(error.message) ? 'EADDRINUSE' : 'DEV_SERVER_FAILED')
  const message = { type: 'failure', code, message: error.message }
  if (process.connected) process.send(message, () => process.exit(1))
  else process.exit(1)
}

const startMain = async () => {
  process.env.NODE_ENV = 'development'
  process.env.BABEL_ENV = 'development'
  const resolve = (name) => require.resolve(name, { paths: [process.cwd()] })
  for (const name of ['paths', 'webpack', 'devServer']) {
    require(resolve(`react-app-rewired/overrides/${name}`))
  }
  const paths = require(resolve('react-scripts/config/paths'))
  const webpack = require(resolve('webpack'))
  const WebpackDevServer = require(resolve('webpack-dev-server'))
  const { createCompiler, prepareProxy, prepareUrls } = require(resolve('react-dev-utils/WebpackDevServerUtils'))
  const urls = prepareUrls('http', '127.0.0.1', Number(process.env.PORT), paths.publicUrlOrPath.slice(0, -1))
  const compiler = createCompiler({
    appName: require(paths.appPackageJson).name,
    config: require(resolve('react-scripts/config/webpack.config'))('development'),
    urls,
    useYarn: fs.existsSync(paths.yarnLockFile),
    useTypeScript: fs.existsSync(paths.appTsConfig),
    webpack,
  })
  let compiled = false
  compiler.hooks.done.tap('DevelopmentInitialCompile', (stats) => {
    if (compiled) return
    if (stats.hasErrors()) {
      const error = new Error('开发主界面编译失败，请查看编译日志')
      error.code = 'DEV_COMPILE_FAILED'
      fail(error)
      return
    }
    compiled = true
  })
  const proxy = prepareProxy(require(paths.appPackageJson).proxy, paths.appPublic, paths.publicUrlOrPath)
  const config = require(resolve('react-scripts/config/webpackDevServer.config'))(proxy, urls.lanUrlForConfig)
  const before = config.onBeforeSetupMiddleware
  server = new WebpackDevServer(
    {
      ...config,
      host: '127.0.0.1',
      port: Number(process.env.PORT),
      onBeforeSetupMiddleware(devServer) {
        devServer.app.use(createSessionMiddleware())
        if (before) before(devServer)
      },
    },
    compiler,
  )
  await server.start()
}

const startStartup = async () => {
  const viteRoot = path.dirname(require.resolve('vite/package.json', { paths: [process.cwd()] }))
  const { createServer } = await import(pathToFileURL(path.join(viteRoot, 'dist/node/index.js')).href)
  server = await createServer({ mode: process.env.YAKIT_DEV_VITE_MODE })
  await server.listen()
}

process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)
process.on('disconnect', async () => {
  try {
    if (server?.stop) await server.stop()
    else if (server?.close) await server.close()
  } finally {
    process.exit()
  }
})
;(process.env.YAKIT_DEV_ROLE === 'main' ? startMain() : startStartup())
  .then(() => process.send({ type: 'listening', port: Number(process.env.PORT) }))
  .catch(fail)
