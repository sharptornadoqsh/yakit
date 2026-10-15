const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createRequire } = require('module')
const { EventEmitter } = require('events')

const createRegistrationHarness = ({ sourceRoot, dependencyRoot = process.cwd(), failPasswordLoad = false } = {}) => {
  sourceRoot = path.resolve(sourceRoot || dependencyRoot)
  dependencyRoot = path.resolve(dependencyRoot)
  const nativeRequire = createRequire(path.join(dependencyRoot, 'package.json'))
  const handlers = new Map()
  const registrationOrder = []
  const calls = []
  const logs = []
  const modules = new Map()
  const realModules = new Set([
    'ipc.js',
    'handlers/portScan.js',
    'handlers/portScan2.js',
    'handlers/handleStreamWithContext.js',
    'errorCollection.js',
    'newErrorCollection.js',
    'api/index.js',
    'passwordTransport.js',
  ])
  const ipcMain = {
    handle: (channel, handler) => {
      if (handlers.has(channel)) throw new Error(`Duplicate IPC handler: ${channel}`)
      handlers.set(channel, handler)
      registrationOrder.push(channel)
    },
  }
  const noop = () => {}
  const state = { HttpSetting: { httpBaseURL: 'https://fixture.example.test' }, USER_INFO: {} }
  const stub = (name) => {
    const register = (...args) => calls.push({ name, method: 'function', args })
    register.register = (...args) => calls.push({ name, method: 'register', args })
    register.registerNewIPC = (...args) => calls.push({ name, method: 'registerNewIPC', args })
    register.initial = () => Promise.resolve()
    register.setLocalCache = noop
    return register
  }
  const stubs = new Map()
  const sourcePath = (relative) => {
    const preferred = path.join(sourceRoot, 'app/main', relative)
    return fs.existsSync(preferred) ? preferred : path.join(dependencyRoot, 'app/main', relative)
  }
  const load = (relative) => {
    relative = relative.split(path.sep).join('/')
    if (modules.has(relative)) return modules.get(relative).exports
    const filename = sourcePath(relative)
    const module = { exports: {} }
    modules.set(relative, module)
    const requireModule = (id) => {
      if (id === 'electron') return { ipcMain, app: {}, nativeImage: {}, Notification: class {} }
      if (id === '@grpc/grpc-js') return { loadPackageDefinition: () => ({ ypb: { Yak: class {} } }) }
      if (id === '@grpc/proto-loader') return { loadSync: () => ({}) }
      if (id === 'sm-crypto' && failPasswordLoad) throw new TypeError('nodeCrypto.getRandomValues is not a function')
      if (!id.startsWith('.') && !path.isAbsolute(id)) return nativeRequire(id)
      const absolute = path.resolve(path.dirname(filename), id)
      const sourceMain = path.resolve(sourceRoot, 'app/main')
      const parentRoot = filename.startsWith(`${sourceMain}${path.sep}`)
        ? sourceMain
        : path.resolve(dependencyRoot, 'app/main')
      let local = path.relative(parentRoot, absolute).split(path.sep).join('/')
      if (!local.endsWith('.js')) local += '.js'
      if (realModules.has(local)) return load(local)
      if (local === 'state.js') return state
      if (local === 'security.js')
        return {
          assertTrustedAppSender: noop,
          normalizeHttpBaseUrl: (value) => value,
          normalizeRelativeApiPath: (value) => value,
        }
      if (local === 'httpServer.js') return { service: async () => ({ code: 200, data: {} }) }
      if (local === 'collaborationClientIdentity.js')
        return {
          registerCollaborationClientIdentityIPC: noop,
          sanitizeRendererConfig: (value) => value,
          setRendererConfig: noop,
        }
      if (local === 'filePath.js')
        return { getConfig: () => ({}), setConfig: noop, getYakitHome: noop, getAppConfigDir: noop }
      if (local === 'logFile.js')
        return {
          printLogOutputFile: (value) => logs.push(value),
          renderLogOutputFile: (value) => logs.push(value),
          openEngineLogFolder: noop,
          openRenderLogFolder: noop,
          openPrintLogFolder: noop,
        }
      if (!stubs.has(local)) stubs.set(local, stub(local))
      return stubs.get(local)
    }
    const fileSystem = {
      ...fs,
      readdirSync: (directory, ...args) => {
        const relativeDirectory = path.relative(path.join(sourceRoot, 'app/main'), directory)
        const fallback = path.join(dependencyRoot, 'app/main', relativeDirectory)
        return fs.readdirSync(fs.existsSync(directory) ? directory : fallback, ...args)
      },
    }
    vm.runInNewContext(
      fs.readFileSync(filename, 'utf8'),
      {
        module,
        exports: module.exports,
        require: (id) => (id === 'fs' ? fileSystem : requireModule(id)),
        __dirname: path.dirname(filename),
        __filename: filename,
        Buffer,
        process,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      },
      { filename },
    )
    return module.exports
  }
  const ipc = load('ipc.js')
  const loadedEvents = []
  const createWindow = (name) => {
    const value = new EventEmitter()
    value.webContents = new EventEmitter()
    value.webContents.send = noop
    value.on('ready-to-show', () => loadedEvents.push(`[${name}] ready-to-show`))
    value.webContents.on('did-finish-load', () => loadedEvents.push(`[${name}] did-finish-load`))
    return value
  }
  const engineLinkWindow = createWindow('engineLinkWin')
  const window = createWindow('mainWin')
  const finishWindowLoads = () => {
    for (const value of [engineLinkWindow, window]) {
      value.webContents.emit('did-finish-load')
      value.emit('ready-to-show')
    }
  }
  const register = async () => {
    const errors = {}
    for (const [name, action] of [
      ['engineLink', () => ipc.registerNewIPC(engineLinkWindow, 'EngineLink:')],
      ['main', () => ipc.registerIPC(window)],
    ]) {
      try {
        action()
      } catch (error) {
        errors[name] = `${error.name}: ${error.message}`
      }
    }
    await Promise.resolve()
    return { errors, success: Object.keys(errors).length === 0 }
  }
  return {
    handlers,
    registrationOrder,
    calls,
    logs,
    load,
    ipcMain,
    register,
    window,
    engineLinkWindow,
    loadedEvents,
    finishWindowLoads,
  }
}

module.exports = { createRegistrationHarness }

if (require.main === module) {
  const sourceRoot = process.argv[2] || process.cwd()
  const dependencyRoot = process.argv[3] || process.cwd()
  const harness = createRegistrationHarness({
    sourceRoot,
    dependencyRoot,
    failPasswordLoad: process.argv.includes('--fail-sm2'),
  })
  harness
    .register()
    .then((result) => {
      const required = [
        'EngineLink:fetch-file-content',
        'fetch-file-content',
        'password-api',
        'debug-print-log',
        'render-error-log',
        'EngineLink:debug-print-log',
        'EngineLink:render-error-log',
      ]
      const missing = required.filter((channel) => !harness.handlers.has(channel))
      console.log(
        JSON.stringify(
          { versions: process.versions, ...result, missing, channels: harness.registrationOrder },
          null,
          2,
        ),
      )
      if (!result.success || missing.length) process.exitCode = 1
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
