const assert = require('assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawn } = require('child_process')
const asar = require('@electron/asar')
const product = require('../../product/renyan.json')
const packageJson = require('../../package.json')
const { extractAndVerifyEngineArchive } = require('../../app/main/engineLifecycle')
const { supportedAssets, verifyEngineBinary, parseBoolean } = require('./prepare-renyan-engine')

const targets = {
  'macos-x64': ['darwin', 'x64', 'mac'],
  'macos-arm64': ['darwin', 'arm64', 'mac-arm64'],
  'windows-x64': ['win32', 'x64', 'win-unpacked'],
  'linux-x64': ['linux', 'x64', 'linux-unpacked'],
  'linux-arm64': ['linux', 'arm64', 'linux-arm64-unpacked'],
}

const resolvePackage = (root, target) => {
  const definition = targets[target]
  if (!definition) throw new Error(`Unsupported package target: ${target}`)
  const [platform, architecture, directory] = definition
  let appDirectory = path.join(root, 'release', directory)
  let contents = appDirectory
  if (platform === 'darwin') {
    const apps = fs.readdirSync(appDirectory).filter((entry) => entry.endsWith('.app'))
    assert.equal(apps.length, 1, 'Expected exactly one macOS application')
    appDirectory = path.join(appDirectory, apps[0])
    contents = path.join(appDirectory, 'Contents')
  }
  const executable =
    platform === 'darwin'
      ? path.join(contents, 'MacOS', product.executableName)
      : path.join(contents, platform === 'win32' ? `${product.executableName}.exe` : product.linuxExecutableName)
  const resources = path.join(contents, platform === 'darwin' ? 'Resources' : 'resources')
  return { platform, architecture, appDirectory, contents, executable, resources }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const verifyRendererStartup = async (executable, env, userData) => {
  const child = spawn(executable, [`--user-data-dir=${userData}`], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let launchError
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-12000)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.on('error', (error) => {
    launchError = error
  })
  try {
    const started = Date.now()
    while (Date.now() - started < 45000) {
      if (launchError) throw launchError
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Packaged application exited before startup: ${child.exitCode}/${child.signalCode}\n${output}`)
      }
      const logDirectory = path.join(env.YAKIT_HOME, 'print-log')
      const logs = fs.existsSync(logDirectory)
        ? fs
            .readdirSync(logDirectory)
            .filter((name) => name.endsWith('.txt'))
            .map((name) => fs.readFileSync(path.join(logDirectory, name), 'utf8'))
            .join('\n')
        : ''
      if (/uncaughtException|render-process-gone|did-fail-load/.test(logs)) {
        throw new Error(`Packaged application reported a startup failure\n${logs.slice(-12000)}`)
      }
      const ready = ['engineLinkWin', 'mainWin'].every(
        (name) => logs.includes(`[${name}] did-finish-load`) && logs.includes(`[${name}] ready-to-show`),
      )
      if (ready && Date.now() - started >= 10000) return
      await wait(500)
    }
    throw new Error(`Packaged renderer did not load within 45 seconds\n${output}`)
  } finally {
    if (child.exitCode === null && child.signalCode === null && !launchError) {
      const closed = new Promise((resolve) => child.once('close', resolve))
      child.kill()
      await Promise.race([closed, wait(5000)])
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await closed
      }
    }
  }
}

const verifyPackage = async ({
  root = path.resolve(__dirname, '../..'),
  target,
  includeEngine,
  signed = false,
  native = true,
}) => {
  const info = resolvePackage(root, target)
  if (native) {
    assert.equal(process.platform, info.platform, 'Package verification requires the target operating system')
    assert.equal(process.arch, info.architecture, 'Package verification requires the target architecture')
    const appData =
      info.platform === 'win32'
        ? process.env.APPDATA
        : info.platform === 'darwin'
          ? path.join(os.homedir(), 'Library/Application Support')
          : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    assert.ok(
      appData && !fs.existsSync(path.join(appData, product.defaultDataDirectory)),
      'Native package verification requires a clean RuiYan profile on a disposable build account',
    )
  }
  const asset = Object.keys(supportedAssets).find((name) => {
    const mapping = supportedAssets[name]
    return mapping.platform === info.platform && mapping.architecture === info.architecture
  })
  verifyEngineBinary(info.executable, asset)
  const archivePath = path.join(info.resources, 'app.asar')
  const readJson = (entry) => JSON.parse(asar.extractFile(archivePath, entry).toString('utf8'))
  const bundledProduct = readJson('product/renyan.json')
  for (const key of ['displayName', 'shortName', 'executableName', 'linuxExecutableName', 'appId']) {
    assert.equal(bundledProduct[key], product[key], `Packaged branding mismatch: ${key}`)
  }
  assert.equal(readJson('package.json').version, packageJson.version, 'Packaged client version mismatch')
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-package-verification-'))
  try {
    if (includeEngine) {
      const manifest = readJson('product/engine-compatibility.json')
      const client = manifest.clientVersions.find((entry) => entry.clientVersion === packageJson.version)
      const artifact = client?.artifacts.find(
        (entry) => entry.platform === info.platform && entry.architecture === info.architecture,
      )
      assert.ok(artifact, 'Packaged engine compatibility entry missing')
      assert.equal(artifact.archiveEntry, `bins/${asset}`, 'Packaged engine entry mismatch')
      assert.equal(artifact.packagedArchive, 'bins/yak.zip', 'Packaged engine archive path mismatch')
      const engine = path.join(temporary, info.platform === 'win32' ? 'yak.exe' : 'yak')
      const verification = await extractAndVerifyEngineArchive({
        archivePath: path.join(info.contents, artifact.packagedArchive),
        archiveSha256: artifact.archiveSha256,
        entryName: artifact.archiveEntry,
        destination: engine,
        engineSha256: artifact.engineSha256,
      })
      assert.equal(verification.archiveVerified, true, 'Packaged engine archive checksum mismatch')
      verifyEngineBinary(engine, asset)
      if (native) {
        if (info.platform !== 'win32') fs.chmodSync(engine, 0o755)
        const version = execFileSync(engine, ['version'], { encoding: 'utf8', timeout: 30000, windowsHide: true })
        assert.ok(version.includes(client.recommendedEngineVersion), `Unexpected engine version: ${version}`)
      }
    }
    if (native) {
      if (info.platform === 'darwin') {
        execFileSync('codesign', ['--verify', '--deep', '--strict', info.appDirectory], { timeout: 30000 })
        if (signed) execFileSync('xcrun', ['stapler', 'validate', info.appDirectory], { timeout: 30000 })
      }
      const env = { ...process.env, YAKIT_HOME: path.join(temporary, 'home'), ELECTRON_RUN_AS_NODE: '1' }
      const runtime = JSON.parse(
        execFileSync(
          info.executable,
          [
            '-e',
            'console.log(JSON.stringify({platform:process.platform,arch:process.arch,electron:process.versions.electron}))',
          ],
          {
            env,
            encoding: 'utf8',
            timeout: 30000,
            windowsHide: true,
          },
        ),
      )
      assert.equal(runtime.platform, info.platform)
      assert.equal(runtime.arch, info.architecture)
      assert.equal(runtime.electron, packageJson.devDependencies.electron)
      delete env.ELECTRON_RUN_AS_NODE
      await verifyRendererStartup(info.executable, env, path.join(temporary, 'user-data'))
    }
    return { target, architecture: info.architecture, includeEngine, native }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

if (require.main === module) {
  verifyPackage({
    target: process.env.PACKAGE_TARGET,
    includeEngine: parseBoolean(process.env.INCLUDE_ENGINE),
    signed: parseBoolean(process.env.PACKAGE_SIGNED || 'false'),
  })
    .then((result) => console.log(`Package verification passed: ${JSON.stringify(result)}`))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}

module.exports = { resolvePackage, verifyPackage, verifyRendererStartup }
