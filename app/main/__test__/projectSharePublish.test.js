// @vitest-environment node
import crypto from 'crypto'
import { resolveProjectSharePublishContext } from '../projectSharePublish'

const setup = () => {
  const script = {
    Id: 7,
    ScriptName: '携带插件',
    Type: 'yak',
    Content: '\uFEFFprintln("中文")\r\n',
    Author: '作者',
    Help: '说明',
    Tags: '项目,离线',
    Params: [
      {
        Field: 'target',
        Required: true,
        TypeVerbose: 'string',
        DefaultValue: 'localhost',
        Group: 'basic',
        ExtraSetting: '{}',
        JsonSchema: '{}',
        UISchema: '{}',
      },
    ],
  }
  const unary = (value) => vi.fn((_params, _options, callback) => callback(null, value))
  const client = {
    QueryProjectDetail: unary({ Id: 4, DatabasePath: '/project.db' }),
    Version: unary({ Version: '1.4.8-beta3' }),
    GetYakScriptById: unary(script),
  }
  return { client, script, input: { localProjectId: 4, pluginIds: [7], pluginVersion: 2 } }
}

describe('从本地 Profile 提取完整分享材料', () => {
  it('按选中 ID 回读源码和参数，正文摘要包含 BOM 与原始换行', async () => {
    const { client, script, input } = setup()
    const result = await resolveProjectSharePublishContext(client, input)
    expect(result.engine).toEqual({
      version: '1.4.8-beta3',
      commit: 'unreported-by-engine',
      exportFormat: 'yakitproject',
    })
    expect(result.plugins).toHaveLength(1)
    const plugin = result.plugins[0]
    expect(Buffer.from(plugin.contentBase64, 'base64').toString('utf8')).toBe(script.Content)
    expect(plugin.fileHash).toBe(crypto.createHash('sha256').update(script.Content).digest('hex'))
    expect(plugin.version).toBe(2)
    expect(plugin.metadata.params[0]).toMatchObject({
      field: 'target',
      required: true,
      group: 'basic',
      jsonSchema: '{}',
      uiSchema: '{}',
    })
    expect(plugin.metadata).toMatchObject({ author: '作者', help: '说明', tags: ['项目', '离线'] })
  })
  it.each([[], [7, 7], [0]])('空、重复或无效选择失败，不用空插件数组伪造完整环境', async (pluginIds) => {
    const { client, input } = setup()
    await expect(resolveProjectSharePublishContext(client, { ...input, pluginIds })).rejects.toThrow('明确选择')
    expect(client.GetYakScriptById).not.toHaveBeenCalled()
  })
  it('空正文或协议未覆盖的运行依赖保留明确失败', async () => {
    const { client, script, input } = setup()
    script.Content = ''
    await expect(resolveProjectSharePublishContext(client, input)).rejects.toThrow('正文为空')
    script.Content = 'println(1)'
    script.PluginEnvKey = ['SECRET']
    await expect(resolveProjectSharePublishContext(client, input)).rejects.toThrow('协议尚未覆盖')
  })
})
