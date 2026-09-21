// @vitest-environment node
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import helper from '../handleStreamWithContext'

const setup = () => {
  const handlers = new Map()
  const owner = new EventEmitter()
  owner.send = vi.fn()
  owner.isDestroyed = () => false
  const inspect = vi.fn(async () => ({ encrypted: false }))
  const receipt = { ProjectId: 4, DatabasePath: '/project.db' }
  const performImport = vi.fn(async () => receipt)
  const module = { exports: {} }
  const injected = {
    electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } },
    path,
    '../filePath': { getAppConfigDir: () => '/fixture' },
    '../projectArchive': { createProjectArchiveStore: () => ({}) },
    '../projectShareBundle': { createProjectShareBundleStore: () => ({}) },
    '../projectShareRecoveryStore': { createProjectShareRecoveryStore: () => ({}) },
    '../projectShareIPC': { registerProjectShareIPC() {} },
    '../projectExport': { registerProjectExportHandler() {} },
    '../projectImport': { inspectProjectImportFile: inspect, importProjectWithReceipt: performImport },
    './handleStreamWithContext': helper,
  }
  new Function('require', 'module', 'exports', fs.readFileSync(path.resolve(__dirname, '../project.js'), 'utf8'))(
    (name) => {
      if (!(name in injected)) throw new Error(name)
      return injected[name]
    },
    module,
    module.exports,
  )
  module.exports({ webContents: owner }, () => ({}))
  return {
    owner,
    inspect,
    performImport,
    receipt,
    invoke: (name, ...args) => handlers.get(name)({ sender: owner }, ...args),
  }
}

describe('实际 ImportProject IPC 注册与操作归属', () => {
  afterEach(() => vi.useRealTimers())
  it('仅返回已验证收据；结束后释放 token 和窗口监听', async () => {
    const { invoke, owner, receipt } = setup()
    await expect(invoke('ImportProject', {}, 'operation')).resolves.toEqual(receipt)
    expect(owner.send).toHaveBeenCalledWith('operation-end', receipt)
    expect(owner.listenerCount('destroyed')).toBe(0)
    await expect(invoke('ImportProject', {}, 'operation')).resolves.toEqual(receipt)
  })
  it('关闭所属窗口中断进行中的导入，不发送成功终态', async () => {
    const { invoke, owner, performImport } = setup()
    performImport.mockImplementation(
      (_client, _params, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('操作已取消')), { once: true })
        }),
    )
    const pending = invoke('ImportProject', {}, 'operation')
    const rejected = expect(pending).rejects.toThrow('操作已取消')
    owner.emit('destroyed')
    await rejected
    expect(owner.send).not.toHaveBeenCalled()
    expect(owner.listenerCount('destroyed')).toBe(0)
  })
  it('取消旧预检的迟到收尾不清除同 token 的新实例', async () => {
    const { invoke, inspect } = setup()
    const pending = []
    inspect.mockImplementation((_file, { signal }) => new Promise((resolve) => pending.push({ signal, resolve })))
    const first = invoke('InspectProjectImportFile', '/first.db', 'same')
    await invoke('cancel-InspectProjectImportFile', 'same')
    const second = invoke('InspectProjectImportFile', '/second.db', 'same')
    pending[0].resolve({ encrypted: false })
    await first
    await invoke('cancel-InspectProjectImportFile', 'same')
    expect(pending[1].signal.aborted).toBe(true)
    pending[1].resolve({ encrypted: false })
    await second
  })
  it('内容预检超时停止扫描并清理定时器和窗口监听', async () => {
    vi.useFakeTimers()
    const { invoke, inspect, owner } = setup()
    inspect.mockImplementation(
      (_file, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        }),
    )
    const pending = invoke('InspectProjectImportFile', '/project.db', 'inspection')
    const rejected = expect(pending).rejects.toThrow('内容校验超时')
    await vi.advanceTimersByTimeAsync(120000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
    expect(owner.listenerCount('destroyed')).toBe(0)
  })
})
