import { EventEmitter } from 'events'
import { runProjectTransfer, type ProjectTransferIpc } from '../projectTransfer'

const createIpc = () => {
  const events = new EventEmitter()
  const ipc = {
    invoke: vi.fn(async (..._args: any[]) => undefined),
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
  } as unknown as ProjectTransferIpc & { invoke: ReturnType<typeof vi.fn> }
  return { ipc, events }
}

describe('项目传输终态和重试', () => {
  afterEach(() => vi.useRealTimers())
  it('调用同步发事件时监听已注册，普通日志中的 error 不影响成功', async () => {
    const { ipc, events } = createIpc()
    ipc.invoke.mockImplementation(async (channel, _params, token) => {
      if (channel === 'ImportProject') {
        events.emit(`${token}-data`, {}, { Verbose: 'error count = 0' })
        events.emit(`${token}-end`, {}, { ProjectId: 1, DatabasePath: '/project.db' })
      }
    })
    await expect(runProjectTransfer(ipc, { channel: 'ImportProject', params: {} })).resolves.toBe('')
    expect(events.eventNames()).toEqual([])
  })
  it.each(['event', 'rejection', 'throw'])('%s 失败立即清理，并允许原文件失败后再导入正确文件', async (mode) => {
    const { ipc, events } = createIpc()
    let attempt = 0
    const tokens: string[] = []
    ipc.invoke.mockImplementation((channel, _params, token) => {
      if (channel !== 'ImportProject') return Promise.resolve()
      tokens.push(token)
      if (attempt++ < 2) {
        if (mode === 'event') events.emit(`${token}-error`, {}, '文件损坏或密码错误')
        if (mode === 'rejection') return Promise.reject(new Error('文件损坏或密码错误'))
        if (mode === 'throw') throw new Error('文件损坏或密码错误')
      } else events.emit(`${token}-end`, {}, { ProjectId: 1, DatabasePath: '/project.db' })
      return Promise.resolve()
    })
    for (let i = 0; i < 2; i++) {
      await expect(
        runProjectTransfer(ipc, { channel: 'ImportProject', params: { ProjectFilePath: 'bad.ruiyanproject' } }),
      ).rejects.toThrow('文件损坏或密码错误')
      expect(events.eventNames()).toEqual([])
    }
    await expect(
      runProjectTransfer(ipc, { channel: 'ImportProject', params: { ProjectFilePath: 'good.ruiyanproject' } }),
    ).resolves.toBe('')
    expect(new Set(tokens).size).toBe(3)
    expect(ipc.invoke.mock.calls.filter(([channel]) => channel === 'cancel-ImportProject')).toHaveLength(2)
  })
  it('取消只触发一次终态，旧结束事件不会成功或污染后续传输', async () => {
    const { ipc, events } = createIpc()
    const controller = new AbortController()
    const operation = runProjectTransfer(ipc, {
      channel: 'ImportProject',
      params: {},
      token: 'old',
      signal: controller.signal,
    })
    controller.abort()
    controller.abort()
    events.emit('old-end')
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(ipc.invoke.mock.calls.filter(([channel]) => channel === 'cancel-ImportProject')).toHaveLength(1)
    expect(events.eventNames()).toEqual([])
    const next = runProjectTransfer(ipc, { channel: 'ImportProject', params: {}, token: 'new' })
    events.emit('old-error', {}, '迟到错误')
    events.emit('new-end', {}, { ProjectId: 1, DatabasePath: '/project.db' })
    await expect(next).resolves.toBe('')
  })
  it('超时停止引擎流并清理定时器', async () => {
    vi.useFakeTimers()
    const { ipc, events } = createIpc()
    const result = runProjectTransfer(ipc, { channel: 'ImportProject', params: {}, timeoutMs: 10 })
    const rejected = result.catch((error) => error)
    await vi.advanceTimersByTimeAsync(10)
    const error = await rejected
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('超时')
    expect(ipc.invoke).toHaveBeenCalledWith('cancel-ImportProject', expect.any(String))
    expect(events.eventNames()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
  it('预先取消不启动 IPC', async () => {
    const { ipc } = createIpc()
    const controller = new AbortController()
    controller.abort()
    await expect(
      runProjectTransfer(ipc, { channel: 'ImportProject', params: {}, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(ipc.invoke).not.toHaveBeenCalled()
  })
})
