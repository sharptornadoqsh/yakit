import { EventEmitter } from 'events'
import { runProjectTransfer } from '@/pages/teamCollaboration/projectTransfer'
import { validateProjectImportPath } from '../projectImport'

describe('导入成功证据', () => {
  it('单独 end 即使之前百分比为 100 也不代表导入成功', async () => {
    const events = new EventEmitter()
    const ipc = {
      on: events.on.bind(events),
      removeListener: events.removeListener.bind(events),
      invoke: vi.fn(async (channel, _params, token) => {
        if (channel === 'ImportProject') {
          events.emit(`${token}-data`, {}, { Percent: 1 })
          events.emit(`${token}-end`, {})
        }
      }),
    }
    await expect(runProjectTransfer(ipc as any, { channel: 'ImportProject', params: {} })).rejects.toThrow('项目收据')
    expect(events.eventNames()).toEqual([])
  })

  it('PDF 报告与未知项目格式使用不同提示', () => {
    expect(() => validateProjectImportPath('/tmp/流量报告.PDF')).toThrow('PDF 是报告')
  })
})
