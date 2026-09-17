// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOfflinePluginBundle } from '../../../packageScript/script/prepare-offline-plugins'
import beforePack from '../../../packageScript/buildHook/before-pack'
import {
  MARKER_KEY,
  readOfflinePluginBundle,
  initializeOfflinePlugins,
  prepareOfflinePluginsForConnection,
} from '../offlinePlugins'

const directories = []
const plugins = ['one', 'two'].map((name, index) => ({
  script_name: name,
  type: 'codec',
  content: 'handle = func(s) { return s }',
  official: true,
  is_private: false,
  id: index + 1,
  params: [{ field: 'target', required: true, type_verbose: 'string' }],
}))
const fixture = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-offline-plugins-'))
  directories.push(directory)
  createOfflinePluginBundle(plugins, directory)
  const scripts = new Map()
  let marker = ''
  let failure = ''
  const client = {
    GetKey: vi.fn((request, options, done) => done(null, { Value: marker })),
    SetKey: vi.fn((request, options, done) => {
      marker = request.Value
      done(null, {})
    }),
    QueryYakScriptByNames: vi.fn(({ YakScriptName }, options, done) =>
      done(null, { Data: YakScriptName.flatMap((name) => (scripts.has(name) ? [scripts.get(name)] : [])) }),
    ),
    ImportYakScriptStream: vi.fn(({ Data }) => {
      const stream = new EventEmitter()
      queueMicrotask(() => {
        if (failure === 'error') return stream.emit('error', new Error('import failed'))
        if (failure !== 'silent') {
          const zip = new AdmZip(Data)
          for (const item of JSON.parse(zip.readAsText('meta.json'))) {
            const script = JSON.parse(zip.readAsText(item.filename))
            scripts.set(item.script_name, { ScriptName: item.script_name, Content: script.content })
            if (failure === 'partial') return stream.emit('error', new Error('partial import'))
          }
        }
        stream.emit('end')
      })
      return stream
    }),
  }
  return {
    client,
    directory,
    scripts,
    activate: vi.fn().mockResolvedValue(undefined),
    setFailure: (value) => {
      failure = value
    },
    marker: () => marker,
  }
}
afterEach(() => {
  const temp = fs.realpathSync(os.tmpdir())
  for (const directory of directories.splice(0)) {
    const resolved = fs.realpathSync(directory)
    if (!resolved.startsWith(`${temp}${path.sep}`) || !path.basename(resolved).startsWith('ruiyan-offline-plugins-'))
      throw new Error('Unexpected test path')
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})

describe('离线官方插件', () => {
  it('仓库快照完整包含 497 个官方公开插件和参数', () => {
    const bundle = readOfflinePluginBundle(path.resolve('bins/database'))
    expect(bundle.metadata).toHaveLength(497)
    expect(bundle.manifest.types['port-scan']).toBe(373)
    const harness = fixture()
    const small = readOfflinePluginBundle(harness.directory)
    const script = JSON.parse(small.archive.readAsText(small.metadata[0].filename))
    expect(JSON.parse(JSON.parse(script.params))[0]).toMatchObject({
      Field: 'target',
      Required: true,
      TypeVerbose: 'string',
    })
  })
  it.each([{ official: false }, { is_private: true }, { content: '' }])(
    '阻止非公开官方或缺内容的数据进入资源包 %j',
    (change) => {
      const { directory } = fixture()
      expect(() => createOfflinePluginBundle([{ ...plugins[0], ...change }], directory)).toThrow()
    },
  )
  it('重复插件名和空快照都被识别', () => {
    const { directory } = fixture()
    expect(() => createOfflinePluginBundle([plugins[0], plugins[0]], directory)).toThrow('Duplicate')
    expect(() => createOfflinePluginBundle([], directory)).toThrow('empty')
  })
  it('缺包、损坏摘要及数量错误均停止初始化', async () => {
    const harness = fixture()
    const zip = path.join(harness.directory, 'official-plugins.zip')
    const original = fs.readFileSync(zip)
    fs.appendFileSync(zip, 'broken')
    await expect(initializeOfflinePlugins(harness)).rejects.toThrow('checksum')
    fs.writeFileSync(zip, original)
    const manifestPath = path.join(harness.directory, 'official-plugins.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, pluginCount: 10 }))
    expect(() => readOfflinePluginBundle(harness.directory)).toThrow('count')
    fs.unlinkSync(zip)
    expect(() => readOfflinePluginBundle(harness.directory)).toThrow()
    expect(harness.client.ImportYakScriptStream).not.toHaveBeenCalled()
  })
  it('首次导入、分类激活成功后写入完成标记，重连不重复导入', async () => {
    const harness = fixture()
    await expect(initializeOfflinePlugins(harness)).resolves.toMatchObject({ imported: 2, complete: true })
    expect(harness.activate).toHaveBeenCalledOnce()
    expect(harness.client.SetKey).toHaveBeenCalledWith(
      expect.objectContaining({ Key: MARKER_KEY }),
      expect.anything(),
      expect.any(Function),
    )
    harness.scripts.delete('one')
    await expect(initializeOfflinePlugins(harness)).resolves.toMatchObject({ imported: 0 })
    expect(harness.client.ImportYakScriptStream).toHaveBeenCalledOnce()
    expect(harness.scripts.has('one')).toBe(false)
  })
  it('保留已有同名用户插件及忽略状态', async () => {
    const harness = fixture()
    harness.scripts.set('one', { ScriptName: 'one', Content: 'custom', Ignored: true })
    await expect(initializeOfflinePlugins(harness)).resolves.toMatchObject({ imported: 1 })
    expect(harness.scripts.get('one')).toEqual({ ScriptName: 'one', Content: 'custom', Ignored: true })
  })
  it.each(['error', 'silent', 'partial'])('导入失败 %s 不写完成标记且可重试', async (failure) => {
    const harness = fixture()
    harness.setFailure(failure)
    await expect(initializeOfflinePlugins(harness)).rejects.toThrow()
    expect(harness.marker()).toBe('')
    harness.setFailure('')
    await expect(initializeOfflinePlugins(harness)).resolves.toMatchObject({ complete: true })
    expect(harness.scripts.size).toBe(2)
  })
  it('分类激活失败时重试仍会激活，但不覆盖已导入内容', async () => {
    const harness = fixture()
    harness.activate.mockRejectedValueOnce(new Error('activation failed'))
    await expect(initializeOfflinePlugins(harness)).rejects.toThrow('activation failed')
    expect(harness.marker()).toBe('')
    harness.scripts.get('one').Content = 'edited'
    await expect(initializeOfflinePlugins(harness)).resolves.toMatchObject({ imported: 0, complete: true })
    expect(harness.activate).toHaveBeenCalledTimes(2)
    expect(harness.scripts.get('one').Content).toBe('edited')
  })
  it('同一本地连接的并行请求共用一次导入', async () => {
    const harness = fixture()
    const options = { ...harness, key: harness.directory, mode: 'local', host: '127.0.0.1' }
    await Promise.all([prepareOfflinePluginsForConnection(options), prepareOfflinePluginsForConnection(options)])
    expect(harness.client.ImportYakScriptStream).toHaveBeenCalledOnce()
  })
  it('远程连接不读取资源或写入插件', async () => {
    const harness = fixture()
    await expect(
      prepareOfflinePluginsForConnection({ ...harness, mode: 'remote', directory: '/missing' }),
    ).resolves.toMatchObject({ skipped: true })
    expect(harness.client.GetKey).not.toHaveBeenCalled()
    expect(harness.client.ImportYakScriptStream).not.toHaveBeenCalled()
  })
  it('本地标记与外部地址不一致时仍然跳过初始化', async () => {
    const harness = fixture()
    await expect(
      prepareOfflinePluginsForConnection({ ...harness, mode: 'local', host: '192.0.2.1' }),
    ).resolves.toMatchObject({ skipped: true })
    expect(harness.client.GetKey).not.toHaveBeenCalled()
  })
  it.each(['win32', 'linux', 'darwin'])('%s 打包在离线快照缺失时停止', async (platform) => {
    const read = fs.readFileSync
    const mock = vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...args) => {
      if (String(file).endsWith('official-plugins.json')) throw new Error('Missing offline snapshot')
      return read(file, ...args)
    })
    try {
      await expect(beforePack({ electronPlatformName: platform })).rejects.toThrow('Missing offline snapshot')
    } finally {
      mock.mockRestore()
    }
  })
})
