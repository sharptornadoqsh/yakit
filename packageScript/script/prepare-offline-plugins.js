const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const toList = (value) => {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const createOfflinePluginBundle = (plugins, directory, source = 'https://www.yaklang.com/api/plugins/download') => {
  const zip = new AdmZip()
  const metadata = []
  const names = new Set()
  const types = {}
  const add = (name, value) => {
    zip.addFile(name, Buffer.from(JSON.stringify(value)))
    zip.getEntry(name).header.time = new Date('2000-01-01T00:00:00Z')
  }
  for (const plugin of [...plugins].sort((a, b) => a.script_name.localeCompare(b.script_name, 'en'))) {
    if (plugin.official !== true || plugin.is_private !== false || !plugin.script_name || !plugin.content) {
      throw new Error('Only complete official public plugins may enter the offline bundle')
    }
    if (names.has(plugin.script_name)) throw new Error(`Duplicate plugin: ${plugin.script_name}`)
    names.add(plugin.script_name)
    const params = (plugin.params || []).map((item) =>
      Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key
            .split('_')
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join(''),
          value,
        ]),
      ),
    )
    const tags = [...new Set(toList(plugin.tags))]
    const groupNames = toList(plugin.group).length ? toList(plugin.group) : tags
    const isPoc = ['mitm', 'port-scan', 'nuclei'].includes(plugin.type)
    const filename = `plugins/${crypto.createHash('sha256').update(plugin.script_name).digest('hex')}.json`
    const script = {
      script_name: plugin.script_name,
      type: plugin.type,
      content: plugin.content,
      params: JSON.stringify(JSON.stringify(params)),
      help: plugin.help || '',
      author: plugin.authors || '',
      tags: tags.join(','),
      is_general_module: !!plugin.is_general_module,
      enable_plugin_selector: !!plugin.enable_plugin_selector,
      plugin_selector_types: plugin.plugin_selector_types || '',
      online_id: plugin.id,
      online_script_name: plugin.script_name,
      online_contributors: plugin.online_contributors || '',
      online_is_private: false,
      uuid: plugin.uuid || '',
      online_base_url: 'https://www.yaklang.com',
      online_official: true,
      online_group: toList(plugin.group).join(','),
      is_core_plugin: !!plugin.isCorePlugin,
      plugin_env_key: JSON.stringify(JSON.stringify(plugin.pluginEnvKey || [])),
      risk_detail: JSON.stringify(
        JSON.stringify(
          (plugin.riskInfo || []).map((risk) => ({
            Level: risk.level,
            TypeVerbose: risk.typeVerbose,
            CVE: risk.cve,
            Description: risk.description,
            Solution: risk.solution,
          })),
        ),
      ),
    }
    add(filename, script)
    metadata.push({
      filename,
      script_name: script.script_name,
      groups: [...new Set(groupNames)].map((name) => ({ name, is_poc_built_in: isPoc })),
    })
    types[script.type] = (types[script.type] || 0) + 1
  }
  if (!metadata.length) throw new Error('Offline plugin bundle is empty')
  add('meta.json', metadata)
  const bytes = zip.toBuffer()
  const manifest = {
    schemaVersion: 1,
    source,
    capturedAt: new Date().toISOString(),
    pluginCount: metadata.length,
    types,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'official-plugins.zip'), bytes)
  fs.writeFileSync(path.join(directory, 'official-plugins.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (require.main === module) {
  const inputs = process.argv.slice(3)
  const pages = inputs.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
  const plugins = pages.flatMap((page) => page.data)
  if (!pages.length || plugins.length !== pages[0].pagemeta.total)
    throw new Error('Incomplete official plugin snapshot')
  console.log(JSON.stringify(createOfflinePluginBundle(plugins, path.resolve(process.argv[2]))))
}

module.exports = { createOfflinePluginBundle }
