import React from 'react'
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartupPage } from '../index'
import * as grpc from '../grpc'
import { yakitApp, yakitEngine } from '@/utils/electronBridge'
import { getLocalValue, setLocalValue } from '@/utils/kv'
import { LocalGVS } from '@/enums/yakitGV'
import { RemoteEngine } from '../components/RemoteEngine/RemoteEngine'

vi.mock('../index.module.scss', () => ({ default: {} }))
vi.mock('../components/EngineLifecyclePanel/EngineLifecyclePanel.module.scss', () => ({ default: {} }))
vi.mock('../components/StartupSplash/StartupSplash.module.scss', () => ({ default: {} }))
vi.mock('../components/RemoteEngine/RemoteEngine', () => ({ RemoteEngine: vi.fn(() => null) }))
vi.mock('../components/DownloadYaklang', () => ({ DownloadYaklang: () => null }))
vi.mock('../components/QuestionModal', () => ({ QuestionModal: () => <div>手工安装说明</div> }))
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }))
vi.mock('@/utils/logCollection', () => ({ debugToPrintLog: vi.fn() }))
vi.mock('@/utils/notification', () => ({ yakitNotify: vi.fn() }))
vi.mock('@/utils/kv', () => ({ getLocalValue: vi.fn(), setLocalValue: vi.fn() }))
vi.mock('@/utils/envfile', () => ({
  __PLATFORM__: 'enterprise',
  FetchSoftwareVersion: () => 'yakit',
  GetConnectPort: () => 9012,
  isCommunityEdition: () => false,
  isCommunityIRify: () => false,
  isCommunityMemfit: () => false,
  isEnpriTrace: () => true,
  isEnpriTraceAgent: () => false,
  isEnpriTraceIRify: () => false,
  isMemfit: () => false,
}))
vi.mock('../utils', () => ({
  DragHeaderHeight: 28,
  SystemInfo: {},
  handleFetchSystem: (callback: (value: string) => void) => callback('Windows_NT'),
  handleFetchIsDev: vi.fn(),
  handleFetchArchitecture: vi.fn(),
  outputToWelcomeConsole: vi.fn(),
}))
vi.mock('../grpc', () => ({
  grpcFetchYakInstallResult: vi.fn(),
  grpcFetchBuildInYakVersion: vi.fn(),
  grpcFetchLocalYakitVersion: vi.fn(),
  grpcInitCVEDatabase: vi.fn(),
  grpcReclaimDatabaseSpace: vi.fn(),
  grpcUnpackBuildInYak: vi.fn(),
  grpcCheckAllowSecretLocal: vi.fn(),
  grpcStartLocalEngine: vi.fn(),
  grpcFixupDatabase: vi.fn(),
  isEngineConnectionAlive: vi.fn(),
}))
vi.mock('@/utils/electronBridge', () => ({
  yakitEngine: {
    getEngineLifecycleInfo: vi.fn(),
    getCurrentYak: vi.fn(),
    clearLocalYaklangVersionCache: vi.fn(),
    connectYaklangEngine: vi.fn(),
    onStartUpEngineMessage: vi.fn(() => vi.fn()),
    onStartYaklangEngineError: vi.fn(() => vi.fn()),
    onEngineLifecycleStage: vi.fn(() => vi.fn()),
  },
  yakitApp: {
    completeEngineLink: vi.fn(),
    onCredentialUpdate: vi.fn(() => vi.fn()),
    onFromMainWindow: vi.fn(() => vi.fn()),
  },
  yakitLogs: { openEngineLog: vi.fn() },
}))

describe('启动页面端口与恢复集成', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.mocked(getLocalValue).mockResolvedValue(undefined)
    vi.mocked(setLocalValue).mockResolvedValue(undefined)
    vi.mocked(grpc.grpcFetchYakInstallResult).mockResolvedValue(true)
    vi.mocked(grpc.grpcFetchBuildInYakVersion).mockResolvedValue('1.4.8-beta3')
    vi.mocked(grpc.grpcFetchLocalYakitVersion).mockResolvedValue('1.4.8')
    vi.mocked(grpc.grpcInitCVEDatabase).mockResolvedValue(undefined)
    vi.mocked(grpc.grpcCheckAllowSecretLocal).mockResolvedValue({
      ok: true,
      status: 'success',
      message: '',
      json: { port: 9013, secret: 'local-secret', version: '1.4.8-beta3' } as any,
    })
    vi.mocked(grpc.grpcStartLocalEngine).mockResolvedValue({ ok: true, status: 'success', message: '', port: 9014 })
    vi.mocked(grpc.isEngineConnectionAlive).mockResolvedValue(true)
    vi.mocked(yakitEngine.getEngineLifecycleInfo).mockResolvedValue(undefined)
    vi.mocked(yakitEngine.connectYaklangEngine).mockImplementation((credential) =>
      credential.Port === 9014 ? Promise.resolve() : Promise.reject(new Error('尚未启动')),
    )
    vi.mocked(yakitEngine.onStartUpEngineMessage).mockReturnValue(() => {})
    vi.mocked(yakitEngine.onStartYaklangEngineError).mockReturnValue(() => {})
    vi.mocked(yakitEngine.onEngineLifecycleStage).mockReturnValue(() => {})
    vi.mocked(yakitApp.onCredentialUpdate).mockReturnValue(() => {})
    vi.mocked(yakitApp.onFromMainWindow).mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const advance = async (steps = 12) => {
    for (let index = 0; index < steps; index += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(500))
    }
  }

  it('正常启动维持原始视觉，检查与真正启动的新端口传至主窗口和缓存', async () => {
    render(<StartupPage />)
    expect(screen.getByRole('status')).toHaveTextContent('睿眼自动化渗透系统正在启动')
    expect(screen.queryByRole('button', { name: '重试启动' })).not.toBeInTheDocument()
    await advance()

    expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledWith(expect.objectContaining({ port: 9012 }))
    expect(grpc.grpcStartLocalEngine).toHaveBeenCalledWith(expect.objectContaining({ port: 9013 }))
    expect(yakitApp.completeEngineLink).toHaveBeenCalledWith({
      credential: expect.objectContaining({ Mode: 'local', Port: 9014, Password: 'local-secret' }),
    })
    expect(setLocalValue).toHaveBeenCalledWith(LocalGVS.YakitEEPort, 9014)
  })

  const expectBrandedSplashOnly = () => {
    expect(screen.getByRole('status')).toHaveTextContent('睿眼自动化渗透系统正在启动')
    expect(screen.queryByText('可恢复错误')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安装引擎' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '选择远程引擎' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '手工安装' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试启动' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开诊断日志' })).not.toBeInTheDocument()
    expect(screen.queryByText('手工安装说明')).not.toBeInTheDocument()
  }

  const sendMainWindowAction = (yakitStatus: string) => {
    const listener = vi.mocked(yakitApp.onFromMainWindow).mock.calls.at(-1)![0]
    act(() => listener({ yakitStatus } as any))
  }

  it.each(['port_occupied', 'unexpected', 'timeout', 'database_error'])(
    '能力检查错误 %s 保持品牌启动页并保留外部重试',
    async (status) => {
      vi.mocked(grpc.grpcCheckAllowSecretLocal).mockResolvedValue({
        ok: false,
        status,
        message: '检查阶段真实错误',
        json: null,
      })
      render(<StartupPage />)
      await advance()
      expectBrandedSplashOnly()
      expect(screen.queryByText('检查阶段真实错误')).not.toBeInTheDocument()
      expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledTimes(1)
      sendMainWindowAction('check_timeout')
      await advance()
      expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['build_yak_error', 'port_occupied', 'timeout'])(
    '真正启动错误 %s 不挂载恢复面板且保留端口重试入口',
    async (status) => {
      vi.mocked(grpc.grpcStartLocalEngine).mockResolvedValue({ ok: false, status, message: '启动阶段真实错误' })
      render(<StartupPage />)
      await advance()
      expectBrandedSplashOnly()
      expect(screen.queryByText(/启动阶段真实错误/)).not.toBeInTheDocument()
      sendMainWindowAction('start_timeout')
      await advance()
      expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledTimes(2)
      expect(yakitApp.completeEngineLink).not.toHaveBeenCalled()
    },
  )

  it('引擎缺失时也不显示安装操作面板', async () => {
    vi.mocked(grpc.grpcFetchYakInstallResult).mockResolvedValue(false)
    vi.mocked(grpc.grpcFetchBuildInYakVersion).mockResolvedValue('')
    render(<StartupPage />)
    await advance()
    expectBrandedSplashOnly()
  })

  it('远程连接仍在后台运行，外部重试保持原端口', async () => {
    vi.mocked(getLocalValue).mockImplementation((key) =>
      Promise.resolve(key === LocalGVS.YaklangEngineMode ? 'remote' : undefined),
    )
    render(<StartupPage />)
    await advance()
    const props = vi.mocked(RemoteEngine).mock.calls.at(-1)![0]
    expect(props.headless).toBe(true)
    expect(props.autoConnect).toBe(true)
    await act(async () => props.onSubmit({ host: '127.0.0.1', port: '18080', password: 'remote-secret' } as any))
    await advance()
    expectBrandedSplashOnly()
    sendMainWindowAction('check_timeout')
    await advance()
    expect(yakitEngine.connectYaklangEngine).toHaveBeenCalledTimes(2)
    expect(yakitEngine.connectYaklangEngine).toHaveBeenLastCalledWith(
      expect.objectContaining({ Mode: 'remote', Port: 18080 }),
    )
    expect(grpc.grpcStartLocalEngine).not.toHaveBeenCalled()
    expect(grpc.grpcCheckAllowSecretLocal).not.toHaveBeenCalled()
  })
})
