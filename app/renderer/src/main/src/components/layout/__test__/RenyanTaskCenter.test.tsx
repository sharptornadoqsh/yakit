import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTaskStatusPresentation, RenyanTaskCenter } from '../RenyanTaskCenter'

const mocks = vi.hoisted(() => ({
  queryTasks: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
}))

vi.mock('@/components/MessageCenter/utils', () => ({
  apiFetchQueryAllTask: mocks.queryTasks,
}))

vi.mock('@/utils/envfile', () => ({
  isEnpriTrace: () => true,
}))

vi.mock('@/utils/timeUtil', () => ({
  formatTimestampJudge: () => '2026-07-20 10:00',
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: {
    on: mocks.on,
    off: mocks.off,
    emit: mocks.emit,
  },
}))

vi.mock('../RenyanTaskCenter.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

describe('\u777f\u773c\u4efb\u52a1\u4e2d\u5fc3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryTasks.mockResolvedValue({
      data: [
        {
          hash: 'task-1',
          taskName: '\u5916\u7f51\u8d44\u4ea7\u68c0\u67e5',
          description: '\u68c0\u67e5\u6307\u5b9a\u8d44\u4ea7\u8303\u56f4',
          status: 1,
          created_at: 1,
          updated_at: 2,
        },
      ],
      pagemeta: { total: 1 },
    })
  })

  it('\u5c06\u771f\u5b9e\u4efb\u52a1\u72b6\u6001\u8f6c\u6362\u4e3a\u754c\u9762\u72b6\u6001', () => {
    expect(getTaskStatusPresentation(1)).toEqual({ label: '\u5f85\u63a5\u6536', tone: 'pending' })
    expect(getTaskStatusPresentation(2)).toEqual({ label: '\u5df2\u5b8c\u6210', tone: 'complete' })
    expect(getTaskStatusPresentation(3)).toEqual({ label: '\u5df2\u53d6\u6d88', tone: 'cancelled' })
  })

  it('\u8bfb\u53d6\u4efb\u52a1\u63a5\u53e3\u5e76\u4ece\u5e95\u90e8\u72b6\u6001\u680f\u6253\u5f00\u4efb\u52a1\u9762\u677f', async () => {
    render(<RenyanTaskCenter enabled />)

    await waitFor(() => expect(mocks.queryTasks).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '\u4efb\u52a1\u4e2d\u5fc3\uff0c1 \u6761\u5f85\u5904\u7406' }))

    expect(screen.getByRole('dialog', { name: '\u4efb\u52a1\u4e2d\u5fc3' })).toHaveTextContent(
      '\u5916\u7f51\u8d44\u4ea7\u68c0\u67e5',
    )
    fireEvent.click(screen.getByRole('button', { name: '\u5728\u6d88\u606f\u4e2d\u5fc3\u5904\u7406' }))
    expect(mocks.emit).toHaveBeenCalledWith('openAllMessageNotification')
  })
})
