// @vitest-environment node
import { EventEmitter } from 'events'
import handler from '../handleStreamWithContext'

const setup = () => {
  const stream = new EventEmitter()
  stream.cancel = vi.fn(() => {
    stream.emit('error', new Error('CANCELLED'))
    stream.emit('close')
  })
  const streams = new Map()
  const win = { webContents: { send: vi.fn() } }
  handler.registerHandler(win, stream, streams, 'import', { terminalOnError: true })
  return { stream, streams, win }
}

describe('项目导入流资源', () => {
  it('无 end 的错误仍清理流表并阻止迟到进度', () => {
    const { stream, streams, win } = setup()
    stream.emit('error', new Error('损坏文件'))
    stream.emit('data', { Percent: 1 })
    stream.emit('end')
    stream.emit('close')
    expect(streams.size).toBe(0)
    expect(stream.eventNames()).toEqual([])
    expect(win.webContents.send.mock.calls).toEqual([['import-error', '损坏文件']])
  })
  it('取消幂等并清理所有监听', async () => {
    const { stream, streams, win } = setup()
    const cancel = handler.cancelHandler(streams)
    await cancel({}, 'import')
    await cancel({}, 'import')
    expect(stream.cancel).toHaveBeenCalledTimes(1)
    expect(stream.eventNames()).toEqual([])
    expect(streams.size).toBe(0)
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
  it('成功和连接关闭分别产生明确终态', () => {
    const success = setup()
    success.stream.emit('end')
    success.stream.emit('close')
    expect(success.win.webContents.send.mock.calls).toEqual([['import-end']])
    const closed = setup()
    closed.stream.emit('close')
    expect(closed.win.webContents.send).toHaveBeenCalledWith('import-error', '项目导入连接已关闭，请重试')
    expect(closed.streams.size).toBe(0)
  })
})
