import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { YaklangEngineWatchDog } from '../index'
import type { YaklangEngineWatchDogProps } from '../index'
import emiter from '@/utils/eventBus/eventBus'
import { yakitEngine } from '@/utils/electronBridge'
import { grpcStartLocalEngine, isEngineConnectionAlive } from '../../../grpc'
import type { YaklangEngineMode } from '@/pages/StartupPage/types'

// Mock 外部依赖
vi.mock('@/utils/eventBus/eventBus', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
  },
}))

vi.mock('@/utils/electronBridge', () => ({
  yakitEngine: {
    connectYaklangEngine: vi.fn(),
  },
}))

vi.mock('../../../grpc', () => ({
  grpcStartLocalEngine: vi.fn(),
  isEngineConnectionAlive: vi.fn(),
}))

vi.mock('../../../utils', () => ({
  outputToWelcomeConsole: vi.fn(),
}))

vi.mock('@/utils/logCollection', () => ({
  debugToPrintLog: vi.fn(),
}))

vi.mock('@/utils/notification', () => ({
  yakitNotify: vi.fn(),
}))

vi.mock('@/utils/envfile', () => ({
  __PLATFORM__: 'yakit',
  FetchSoftwareVersion: vi.fn(() => 'yakit'),
  isEnpriTraceAgent: vi.fn(() => false),
}))

describe('YaklangEngineWatchDog 组件测试', () => {
  let props: YaklangEngineWatchDogProps
  let triggerEngineTest: () => void

  beforeEach(() => {
    props = {
      credential: {
        Mode: 'local',
        Host: '127.0.0.1',
        Port: 9011,
        Password: 'test-password',
      },
      keepalive: false,
      engineLink: false,
      yakitStatus: '',
      setYakitStatus: vi.fn(),
      setCheckLog: vi.fn(),
      onReady: vi.fn(),
      onFailed: vi.fn(),
      onKeepaliveShouldChange: vi.fn(),
    }

    vi.clearAllMocks()
    vi.mocked(yakitEngine.connectYaklangEngine).mockRejectedValue(new Error('fail'))
    vi.mocked(grpcStartLocalEngine).mockResolvedValue({ ok: true, status: 'success', message: '' })
    vi.mocked(emiter.on).mockImplementation((event: any, callback) => {
      if (event === 'startAndCreateEngineProcess') {
        triggerEngineTest = callback as () => void
      }
      return emiter
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('engineTest - 引擎连接测试（由 startAndCreateEngineProcess 事件触发）', () => {
    it('当 credential.Mode 为空时，应直接返回，不调用连接', () => {
      props.credential.Mode = '' as YaklangEngineMode
      render(<YaklangEngineWatchDog {...props} />)
      triggerEngineTest()

      expect(yakitEngine.connectYaklangEngine).not.toHaveBeenCalled()
    })

    it('当 credential.Port <= 0 时，应直接返回, 不调用连接', () => {
      props.credential.Port = 0
      render(<YaklangEngineWatchDog {...props} />)
      triggerEngineTest()

      expect(yakitEngine.connectYaklangEngine).not.toHaveBeenCalled()
    })

    it('连接成功时，应调用 onKeepaliveShouldChange(true)', async () => {
      vi.mocked(yakitEngine.connectYaklangEngine).mockResolvedValue(undefined)
      render(<YaklangEngineWatchDog {...props} />)
      triggerEngineTest()

      await waitFor(() => {
        expect(props.onKeepaliveShouldChange).toHaveBeenCalledWith(true)
      })
    })

    it('连接失败且 mode = "local" 时，应触发自动启动本地引擎', async () => {
      render(<YaklangEngineWatchDog {...props} />)
      triggerEngineTest()

      await waitFor(
        () => {
          expect(grpcStartLocalEngine).toHaveBeenCalled()
        },
        { timeout: 2000 },
      )
    })

    it('连接失败且 mode = "remote" 时，不自动启动本地引擎', async () => {
      props.credential.Mode = 'remote'
      render(<YaklangEngineWatchDog {...props} />)
      triggerEngineTest()

      await waitFor(() => {
        expect(grpcStartLocalEngine).not.toHaveBeenCalled()
        expect(props.setYakitStatus).toHaveBeenCalledWith('error')
        expect(props.setCheckLog).toHaveBeenCalledWith(['远程引擎连接失败：Error: fail'])
      })
    })
  })

  describe('自动启动本地引擎（autoStartProgress 触发的 useDebounceEffect）', () => {
    it('启动成功时，应调用 onKeepaliveShouldChange(true)', async () => {
      render(<YaklangEngineWatchDog {...props} />)
      triggerEngineTest()

      await waitFor(
        () => {
          expect(props.onKeepaliveShouldChange).toHaveBeenCalledWith(true)
        },
        { timeout: 2000 },
      )
    })

    it('启动失败时，不调用 onKeepaliveShouldChange', async () => {
      vi.mocked(grpcStartLocalEngine).mockResolvedValue({ ok: false, status: 'error', message: '' })
      render(<YaklangEngineWatchDog {...props} />)
      act(() => triggerEngineTest())
      await waitFor(() => expect(grpcStartLocalEngine).toHaveBeenCalled(), { timeout: 2000 })
      expect(props.onKeepaliveShouldChange).not.toHaveBeenCalled()
    })
  })

  describe('keepalive 探活逻辑', () => {
    it('当 keepalive 为 false 时，应直接调用 onFailed(100) 且不启动定时器', () => {
      render(<YaklangEngineWatchDog {...props} />)

      expect(props.onFailed).toHaveBeenCalledWith(100)
      expect(isEngineConnectionAlive).not.toHaveBeenCalled()
    })

    it('当 keepalive 为 true 且引擎连接存活时，应调用 onReady', async () => {
      props.keepalive = true
      vi.mocked(isEngineConnectionAlive).mockResolvedValue(undefined)
      render(<YaklangEngineWatchDog {...props} />)

      await waitFor(() => {
        expect(props.onReady).toHaveBeenCalled()
      })
    })

    it('当 keepalive 为 true 但引擎连接失败时，应调用 onFailed', async () => {
      props.keepalive = true
      vi.mocked(isEngineConnectionAlive).mockRejectedValue(new Error('fail'))
      render(<YaklangEngineWatchDog {...props} />)

      await waitFor(() => {
        expect(props.onFailed).toHaveBeenCalled()
      })
    })
  })

  describe('实际端口与异步请求隔离', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      props.onLocalEngineStarted = vi.fn(() => true)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const start = async () => {
      await act(async () => triggerEngineTest())
      await act(async () => vi.advanceTimersByTimeAsync(1100))
    }

    it('新端口先同步至父凭据，再开启探活', async () => {
      vi.mocked(grpcStartLocalEngine).mockResolvedValue({ ok: true, status: 'success', message: '', port: 9013 })
      render(<YaklangEngineWatchDog {...props} />)
      await start()

      expect(props.onLocalEngineStarted).toHaveBeenCalledWith(9013, props.credential)
      expect(props.onKeepaliveShouldChange).toHaveBeenCalledWith(true)
      expect(vi.mocked(props.onLocalEngineStarted).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(props.onKeepaliveShouldChange).mock.invocationCallOrder[0],
      )
    })

    it.each([
      ['port_occupied', 'port_occupied'],
      ['build_yak_error', 'error'],
      ['timeout', 'start_timeout'],
    ])('启动失败 %s 将日志和状态交给可见恢复入口', async (status, expected) => {
      vi.mocked(grpcStartLocalEngine).mockResolvedValue({ ok: false, status, message: '真实启动错误' })
      render(<YaklangEngineWatchDog {...props} />)
      await start()

      expect(props.setCheckLog).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('真实启动错误')]))
      expect(props.setYakitStatus).toHaveBeenCalledWith(expected)
      expect(props.onKeepaliveShouldChange).not.toHaveBeenCalled()
    })

    it('启动取消不传播端口且显示已中断状态', async () => {
      vi.mocked(grpcStartLocalEngine).mockResolvedValue({ ok: false, status: 'cancelled', message: '已取消' })
      render(<YaklangEngineWatchDog {...props} />)
      await start()

      expect(props.setYakitStatus).toHaveBeenCalledWith('break')
      expect(props.onLocalEngineStarted).not.toHaveBeenCalled()
      expect(props.onKeepaliveShouldChange).not.toHaveBeenCalled()
    })

    it.each(['break', 'remote', 'unmount'])('%s 之后的本地成功响应不生效', async (change) => {
      let finish: (result: any) => void
      vi.mocked(grpcStartLocalEngine).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
      const { rerender, unmount } = render(<YaklangEngineWatchDog {...props} />)
      await start()

      if (change === 'unmount') unmount()
      else if (change === 'break') rerender(<YaklangEngineWatchDog {...props} yakitStatus="break" />)
      else rerender(<YaklangEngineWatchDog {...props} credential={{ ...props.credential, Mode: 'remote' }} />)
      await act(async () => finish({ ok: true, status: 'success', port: 9020 }))

      expect(props.onLocalEngineStarted).not.toHaveBeenCalled()
      expect(props.onKeepaliveShouldChange).not.toHaveBeenCalled()
    })

    it('新请求发起后忽略旧请求成功', async () => {
      let first: (result: any) => void
      let second: (result: any) => void
      vi.mocked(grpcStartLocalEngine)
        .mockImplementationOnce(() => new Promise((resolve) => (first = resolve)))
        .mockImplementationOnce(() => new Promise((resolve) => (second = resolve)))
      render(<YaklangEngineWatchDog {...props} />)
      await start()
      await start()
      await act(async () => first({ ok: true, status: 'success', port: 9012 }))
      expect(props.onLocalEngineStarted).not.toHaveBeenCalled()

      await act(async () => second({ ok: true, status: 'success', port: 9014 }))
      expect(props.onLocalEngineStarted).toHaveBeenCalledOnce()
      expect(props.onLocalEngineStarted).toHaveBeenCalledWith(9014, props.credential)
    })

    it('取消探活后忽略已发出的 Echo 结果', async () => {
      let finish: (result: any) => void
      vi.mocked(isEngineConnectionAlive).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
      const { rerender } = render(<YaklangEngineWatchDog {...props} keepalive />)
      rerender(<YaklangEngineWatchDog {...props} keepalive={false} />)
      await act(async () => finish(true))
      expect(props.onReady).not.toHaveBeenCalled()
    })
  })
})
