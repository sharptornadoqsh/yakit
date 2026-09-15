import React from 'react'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartupPage } from '../index'
import * as grpc from '../grpc'
import { yakitApp, yakitEngine } from '@/utils/electronBridge'
import { getLocalValue, setLocalValue } from '@/utils/kv'
import { LocalGVS } from '@/enums/yakitGV'

vi.mock('../index.module.scss', () => ({ default: {} }))
vi.mock('../components/EngineLifecyclePanel/EngineLifecyclePanel.module.scss', () => ({ default: {} }))
vi.mock('../components/StartupSplash/StartupSplash.module.scss', () => ({ default: {} }))
vi.mock('../components/RemoteEngine/RemoteEngine', () => ({
  RemoteEngine: ({ headless, onSubmit }: any) =>
    headless ? null : (
      <div>
        远程引擎设置
        <button onClick={() => onSubmit({ host: '127.0.0.1', port: '18080', password: 'remote-secret' })}>
          连接远程测试引擎
        </button>
      </div>
    ),
}))
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

  it.each(['port_occupied', 'unexpected', 'timeout'])('能力检查错误 %s 可见且重试重新执行检查', async (status) => {
    vi.mocked(grpc.grpcCheckAllowSecretLocal).mockResolvedValue({
      ok: false,
      status,
      message: '检查阶段真实错误',
      json: null,
    })
    render(<StartupPage />)
    await advance()

    const retry = screen.getByRole('button', { name: '重试启动' })
    expect(retry.closest('[aria-hidden="true"]')).toBeNull()
    expect(retry).toBeEnabled()
    expect(screen.getByText('检查阶段真实错误')).toBeVisible()
    expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledTimes(1)
    fireEvent.click(retry)
    await advance()
    expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledTimes(2)
  })

  it.each(['build_yak_error', 'port_occupied', 'timeout'])('真正启动错误 %s 可见且可重试', async (status) => {
    vi.mocked(grpc.grpcStartLocalEngine).mockResolvedValue({ ok: false, status, message: '启动阶段真实错误' })
    render(<StartupPage />)
    await advance()

    const retry = screen.getByRole('button', { name: '重试启动' })
    expect(retry.closest('[aria-hidden="true"]')).toBeNull()
    expect(screen.getByText(/启动阶段真实错误/)).toBeVisible()
    fireEvent.click(retry)
    await advance()
    expect(grpc.grpcCheckAllowSecretLocal).toHaveBeenCalledTimes(2)
    expect(yakitApp.completeEngineLink).not.toHaveBeenCalled()
  })

  it('引擎缺失时显示操作面板，远程切换显示可操作的设置', async () => {
    vi.mocked(grpc.grpcFetchYakInstallResult).mockResolvedValue(false)
    vi.mocked(grpc.grpcFetchBuildInYakVersion).mockResolvedValue('')
    render(<StartupPage />)
    await advance()
    expect(screen.getByRole('button', { name: '安装引擎' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '选择远程引擎' }))
    await advance()
    expect(screen.getByText('远程引擎设置')).toBeVisible()
    expect(screen.getByText('远程引擎设置').closest('[aria-hidden="true"]')).toBeNull()
  })

  it('远程连接失败后重试保持远程端口，不启动本地引擎', async () => {
    vi.mocked(grpc.grpcFetchYakInstallResult).mockResolvedValue(false)
    vi.mocked(grpc.grpcFetchBuildInYakVersion).mockResolvedValue('')
    render(<StartupPage />)
    await advance()
    fireEvent.click(screen.getByRole('button', { name: '选择远程引擎' }))
    await advance()
    fireEvent.click(screen.getByRole('button', { name: '连接远程测试引擎' }))
    await advance()
    fireEvent.click(screen.getByRole('button', { name: '重试启动' }))
    await advance()
    expect(yakitEngine.connectYaklangEngine).toHaveBeenCalledTimes(2)
    expect(yakitEngine.connectYaklangEngine).toHaveBeenLastCalledWith(
      expect.objectContaining({ Mode: 'remote', Port: 18080 }),
    )
    expect(grpc.grpcStartLocalEngine).not.toHaveBeenCalled()
    expect(grpc.grpcCheckAllowSecretLocal).not.toHaveBeenCalled()
  })
})
