import { createElectronProjectShareRuntimeDependencies } from '../projectShareElectronRuntime'

vi.mock('@/services/teamCollaboration', () => ({}))
const content = '\uFEFFprintln("中文")\r\n'
const bytes = new TextEncoder().encode(content)
const contentBase64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
const plugin = {
  scriptName: 'project-plugin',
  type: 'yak',
  version: 2,
  fileHash: 'a'.repeat(64),
  handle: 'plugin',
  entry: 'plugins/1.json',
  byteLength: bytes.length,
  sha256: 'a'.repeat(64),
  metadata: {
    author: '作者',
    help: '说明',
    tags: ['项目'],
    params: [
      {
        field: 'target',
        fieldVerbose: '目标',
        required: true,
        typeVerbose: 'string',
        defaultValue: '',
        extraSetting: '{}',
        help: '',
        group: 'basic',
      },
    ],
  },
}
const setup = () => {
  let stored: any
  const invoke = vi.fn(async (channel, input) => {
    if (channel === 'QueryYakScript') return { Data: stored ? [stored] : [] }
    if (channel === 'SaveYakScript') {
      stored = { ...input, Id: 7 }
      return stored
    }
    if (channel === 'GetYakScriptById') return stored
  })
  Object.defineProperty(window, 'require', { configurable: true, value: () => ({ ipcRenderer: { invoke } }) })
  return {
    invoke,
    runtime: createElectronProjectShareRuntimeDependencies(),
    getStored: () => stored,
    setStored: (value) => {
      stored = value
    },
  }
}

describe('插件安装正文与回读', () => {
  it('真实安装参数包含源码、类型和完整参数，保存后回读核对', async () => {
    const { runtime, invoke, getStored } = setup()
    await runtime.installPlugin({ localProjectId: 41, plugin, contentBase64 })
    expect(getStored()).toMatchObject({
      Content: content,
      Type: 'yak',
      Author: '作者',
      Help: '说明',
      Tags: '项目',
      Params: [expect.objectContaining({ Field: 'target', Required: true, ExtraSetting: '{}', Group: 'basic' })],
    })
    expect(invoke).toHaveBeenLastCalledWith('GetYakScriptById', { Id: 7 })
    await runtime.installPlugin({ localProjectId: 41, plugin, contentBase64 })
    expect(invoke).toHaveBeenCalledWith('SaveYakScript', expect.objectContaining({ Id: 7 }))
  })
  it('同名不同正文不静默覆盖原插件', async () => {
    const { runtime, invoke, setStored } = setup()
    setStored({ Id: 7, ScriptName: plugin.scriptName, Type: 'yak', Content: 'original' })
    await expect(runtime.installPlugin({ localProjectId: 41, plugin, contentBase64 })).rejects.toThrow('同名插件')
    expect(invoke.mock.calls.some(([channel]) => channel === 'SaveYakScript')).toBe(false)
  })
  it('保存完成但回读失败时保持失败，随后可重试同一插件', async () => {
    const { runtime, invoke } = setup()
    const original = invoke.getMockImplementation()!
    let interrupted = true
    invoke.mockImplementation(async (channel, input) => {
      if (channel === 'GetYakScriptById' && interrupted) throw new Error('引擎断开')
      return original(channel, input)
    })
    await expect(runtime.installPlugin({ localProjectId: 41, plugin, contentBase64 })).rejects.toThrow('引擎断开')
    interrupted = false
    await expect(runtime.installPlugin({ localProjectId: 41, plugin, contentBase64 })).resolves.toBeUndefined()
  })
})
