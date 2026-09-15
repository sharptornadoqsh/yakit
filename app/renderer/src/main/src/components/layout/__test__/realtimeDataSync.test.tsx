import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as layout from '../utils'

const state = vi.hoisted(() => ({
  userInfo: { isLogin: true, token: 'session-a' },
  enabled: true,
  config: vi.fn(),
  flow: vi.fn(),
  risk: vi.fn(),
}))
vi.mock('@/store', () => ({
  useStore: Object.assign(() => ({ userInfo: state.userInfo }), { getState: () => ({ userInfo: state.userInfo }) }),
  useEeSystemConfig: () => ({ setEeSystemConfig: vi.fn() }),
}))
vi.mock('@/services/fetch', () => ({ NetWorkApi: (...args: any[]) => state.config(...args) }))
vi.mock('@/utils/login', () => ({
  aboutLoginUpload: (...args: any[]) => state.risk(...args),
  loginHTTPFlowsToOnline: (...args: any[]) => state.flow(...args),
}))
vi.mock('@/utils/envfile', () => ({ isEnpriTrace: () => true, isEnpriTraceAgent: () => false }))
vi.mock('@/pages/spaceEngine/utils', () => ({ apiUpdateGlobalNetworkConfig: vi.fn() }))
vi.mock('@/utils/eventBus/eventBus', () => ({ default: { emit: vi.fn() } }))
vi.mock('@/utils/notification', () => ({ yakitNotify: vi.fn() }))
vi.mock('@/services/electronBridge', () => ({ yakitProject: {}, yakitUpload: {} }))
vi.mock('@/i18n/i18n', () => ({ default: { getFixedT: () => (key: string) => key } }))

const mount = () => {
  expect(layout).toHaveProperty('useRealtimeDataSync')
  return renderHook(() => (layout as any).useRealtimeDataSync())
}
const renderHook = <T,>(hook: () => T) => {
  const result = { current: undefined as T }
  const Probe = () => {
    result.current = hook()
    return null
  }
  const rendered = render(<Probe />)
  return { ...rendered, result, rerender: () => rendered.rerender(<Probe />) }
}
const tick = async (milliseconds = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

describe('流量与漏洞秒级增量同步', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    state.userInfo = { isLogin: true, token: 'session-a' }
    state.enabled = true
    state.config.mockImplementation(async () => ({
      data: [{ configName: 'syncData', isOpen: state.enabled, content: '' }],
    }))
    state.flow.mockResolvedValue(undefined)
    state.risk.mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('立即检查开关并在三秒后再次同步流量和漏洞', async () => {
    mount()
    await tick()
    expect(state.flow).toHaveBeenCalledTimes(1)
    expect(state.risk).toHaveBeenCalledTimes(1)
    await tick(3000)
    expect(state.flow).toHaveBeenCalledTimes(2)
    expect(state.risk).toHaveBeenCalledTimes(2)
  })

  it('关闭时不上传，重新开启后自动继续', async () => {
    state.enabled = false
    mount()
    await tick()
    expect(state.flow).not.toHaveBeenCalled()
    expect(state.risk).not.toHaveBeenCalled()
    state.enabled = true
    await tick(3000)
    expect(state.flow).toHaveBeenCalledTimes(1)
    expect(state.risk).toHaveBeenCalledTimes(1)
    state.enabled = false
    await tick(3000)
    expect(state.flow).toHaveBeenCalledTimes(1)
    expect(state.risk).toHaveBeenCalledTimes(1)
  })

  it('流量失败不阻止漏洞上传且下一周期重试', async () => {
    state.flow.mockRejectedValueOnce(new Error('offline'))
    mount()
    await tick()
    expect(state.risk).toHaveBeenCalledTimes(1)
    await tick(3000)
    expect(state.flow).toHaveBeenCalledTimes(2)
    expect(state.risk).toHaveBeenCalledTimes(2)
  })

  it('多个触发合并在途任务并等待两类任务完成', async () => {
    let resolve!: () => void
    state.flow.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done
      }),
    )
    const { result } = renderHook(() => layout.useUploadInfoByEnpriTrace())
    let first!: Promise<unknown>
    let second!: Promise<unknown>
    let finished = false
    await act(async () => {
      first = result.current[0].startUpload({ isUploadSyncData: true }).then(() => {
        finished = true
      })
      second = result.current[0].startUpload({ isUploadSyncData: true })
    })
    try {
      expect(state.flow).toHaveBeenCalledTimes(1)
      expect(state.risk).toHaveBeenCalledTimes(1)
      expect(finished).toBe(false)
    } finally {
      await act(async () => {
        resolve()
        await Promise.all([first, second])
      })
    }
  })

  it('登出和卸载后停止调度', async () => {
    const { rerender, unmount } = mount()
    await tick()
    state.userInfo = { isLogin: false, token: '' }
    rerender()
    await tick(9000)
    expect(state.flow).toHaveBeenCalledTimes(1)
    unmount()
    await tick(9000)
    expect(state.config).toHaveBeenCalledTimes(1)
  })

  it('配置迟到时不使用已登出的会话上传', async () => {
    let resolve!: (value: any) => void
    state.config.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { result } = renderHook(() => layout.useUploadInfoByEnpriTrace())
    let request!: Promise<unknown>
    act(() => {
      request = result.current[0].startUpload({ isUploadSyncData: true })
    })
    state.userInfo = { isLogin: false, token: '' }
    await act(async () => {
      resolve({ data: [{ configName: 'syncData', isOpen: true }] })
      await request
    })
    expect(state.flow).not.toHaveBeenCalled()
    expect(state.risk).not.toHaveBeenCalled()
  })

  it('配置读取失败时不上传且下一轮恢复', async () => {
    state.config.mockRejectedValueOnce(new Error('offline'))
    mount()
    await tick()
    expect(state.flow).not.toHaveBeenCalled()
    expect(state.risk).not.toHaveBeenCalled()
    await tick(3000)
    expect(state.flow).toHaveBeenCalledTimes(1)
    expect(state.risk).toHaveBeenCalledTimes(1)
  })

  it('慢上传结束后再调度下一轮而非每三秒堆积调用', async () => {
    let resolve!: () => void
    state.flow.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done
      }),
    )
    mount()
    await tick(12000)
    expect(state.flow).toHaveBeenCalledTimes(1)
    expect(state.config).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve()
      await Promise.resolve()
    })
    await tick(3000)
    expect(state.flow).toHaveBeenCalledTimes(2)
    expect(state.risk).toHaveBeenCalledTimes(2)
  })
})
