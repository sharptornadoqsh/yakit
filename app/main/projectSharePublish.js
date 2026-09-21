const crypto = require('crypto')
const { callProjectRpc } = require('./projectImport')

const resolveProjectSharePublishContext = async (client, { localProjectId, pluginIds, pluginVersion }) => {
  if (!Number.isSafeInteger(localProjectId) || localProjectId <= 0) throw new Error('请选择有效的本地项目')
  if (
    !Array.isArray(pluginIds) ||
    pluginIds.length === 0 ||
    pluginIds.length > 1000 ||
    pluginIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(pluginIds).size !== pluginIds.length
  ) {
    throw new Error('请明确选择需要携带的本地插件，最多 1000 个且不得重复')
  }
  if (!Number.isSafeInteger(pluginVersion) || pluginVersion <= 0) throw new Error('插件快照版本必须为正整数')
  const project = await callProjectRpc(client, 'QueryProjectDetail', { Id: localProjectId })
  if (Number(project?.Id) !== localProjectId || !project.DatabasePath) throw new Error('本地项目不存在或缺少数据库')
  const version = await callProjectRpc(client, 'Version', {})
  if (!version?.Version) throw new Error('读取正在连接的引擎版本失败')
  const plugins = []
  const names = new Set()
  for (const id of pluginIds) {
    const script = await callProjectRpc(client, 'GetYakScriptById', { Id: id })
    if (Number(script?.Id) !== id || !script.ScriptName?.trim() || !script.Type || !script.Content?.trim()) {
      throw new Error(`插件 #${id} 不存在或正文为空，请刷新后重新选择`)
    }
    if (names.has(script.ScriptName)) throw new Error(`插件名称重复：${script.ScriptName}`)
    names.add(script.ScriptName)
    if (script.IsGeneralModule || script.EnablePluginSelector || script.PluginEnvKey?.length) {
      throw new Error(`插件 ${script.ScriptName} 依赖额外模块、选择器或环境键；现有分享元数据协议尚未覆盖这些依赖`)
    }
    const bytes = Buffer.from(script.Content, 'utf8')
    if (bytes.toString('utf8') !== script.Content || bytes.length > 10 * 1024 * 1024) {
      throw new Error(`插件 ${script.ScriptName} 正文编码无效或超过 10 MiB`)
    }
    plugins.push({
      scriptName: script.ScriptName,
      type: script.Type,
      version: pluginVersion,
      fileHash: crypto.createHash('sha256').update(bytes).digest('hex'),
      contentBase64: bytes.toString('base64'),
      metadata: {
        author: script.Author || '',
        help: script.Help || '',
        tags: (script.Tags || '').split(',').filter(Boolean),
        params: (script.Params || []).map((parameter) => ({
          field: parameter.Field || '',
          fieldVerbose: parameter.FieldVerbose || '',
          required: Boolean(parameter.Required),
          typeVerbose: parameter.TypeVerbose || '',
          defaultValue: parameter.DefaultValue || '',
          extraSetting: parameter.ExtraSetting || '',
          help: parameter.Help || '',
          group: parameter.Group || '',
          methodType: parameter.MethodType || '',
          jsonSchema: parameter.JsonSchema || '',
          uiSchema: parameter.UISchema || '',
          suggestionDataExpression: parameter.SuggestionDataExpression || '',
        })),
      },
    })
  }
  return {
    engine: { version: version.Version, commit: 'unreported-by-engine', exportFormat: 'yakitproject' },
    plugins,
  }
}

module.exports = { resolveProjectSharePublishContext }
