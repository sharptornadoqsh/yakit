const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const MARKER_KEY = 'ruiyan-official-offline-plugins'
const pending = new Map()

const readOfflinePluginBundle = (directory) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'official-plugins.json'), 'utf8'))
  const bytes = fs.readFileSync(path.join(directory, 'official-plugins.zip'))
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
  if (manifest.schemaVersion !== 1 || sha256 !== manifest.sha256)
    throw new Error('Offline plugin bundle checksum mismatch')
  const archive = new AdmZip(bytes)
  const metadata = JSON.parse(archive.readAsText('meta.json'))
  if (!Array.isArray(metadata) || !metadata.length || metadata.length !== manifest.pluginCount)
    throw new Error('Offline plugin count mismatch')
  const names = new Set()
  for (const entry of metadata) {
    const script = JSON.parse(archive.readAsText(entry.filename))
    if (
      !entry.script_name ||
      names.has(entry.script_name) ||
      script.script_name !== entry.script_name ||
      !script.content ||
      script.online_official !== true ||
      script.online_is_private !== false
    ) {
      throw new Error('Invalid official offline plugin entry')
    }
    names.add(entry.script_name)
  }
  return { manifest, archive, metadata }
}

const call = (client, method, request) =>
  new Promise((resolve, reject) => {
    client[method](request, { deadline: Date.now() + 60000 }, (error, response) =>
      error ? reject(error) : resolve(response),
    )
  })

const initializeOfflinePlugins = async ({ client, directory, activate }) => {
  const bundle = readOfflinePluginBundle(directory)
  const marker = await call(client, 'GetKey', { Key: MARKER_KEY })
  if (marker.Value === bundle.manifest.sha256) return { imported: 0, complete: true }
  const names = bundle.metadata.map((entry) => entry.script_name)
  const existing = new Set()
  for (let offset = 0; offset < names.length; offset += 100) {
    const result = await call(client, 'QueryYakScriptByNames', { YakScriptName: names.slice(offset, offset + 100) })
    for (const script of result.Data || []) existing.add(script.ScriptName)
  }
  const missing = bundle.metadata.filter((entry) => !existing.has(entry.script_name))
  if (missing.length) {
    const archive = new AdmZip()
    archive.addFile('meta.json', Buffer.from(JSON.stringify(missing)))
    for (const entry of missing) archive.addFile(entry.filename, bundle.archive.readFile(entry.filename))
    await new Promise((resolve, reject) => {
      const stream = client.ImportYakScriptStream({ Data: archive.toBuffer() }, { deadline: Date.now() + 120000 })
      stream.on('data', () => {})
      stream.once('error', reject)
      stream.once('end', resolve)
    })
    for (let offset = 0; offset < missing.length; offset += 100) {
      const expected = missing.slice(offset, offset + 100).map((entry) => entry.script_name)
      const result = await call(client, 'QueryYakScriptByNames', { YakScriptName: expected })
      const imported = new Set((result.Data || []).map((script) => script.ScriptName))
      if (expected.some((name) => !imported.has(name)))
        throw new Error('Offline plugin import did not persist all entries')
    }
  }
  await activate?.()
  await call(client, 'SetKey', { Key: MARKER_KEY, Value: bundle.manifest.sha256 })
  return { imported: missing.length, total: names.length, complete: true }
}

const prepareOfflinePluginsForConnection = async ({ client, mode, host, directory, key, activate }) => {
  if (mode !== 'local' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host).toLowerCase())) {
    return { imported: 0, skipped: true }
  }
  if (!pending.has(key)) {
    pending.set(
      key,
      initializeOfflinePlugins({ client, directory, activate }).finally(() => pending.delete(key)),
    )
  }
  return pending.get(key)
}

module.exports = { MARKER_KEY, readOfflinePluginBundle, initializeOfflinePlugins, prepareOfflinePluginsForConnection }
