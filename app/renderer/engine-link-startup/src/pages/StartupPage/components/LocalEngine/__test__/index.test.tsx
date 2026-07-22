import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FetchSoftwareVersion } from '@/utils/envfile'
import { yakitEngine } from '@/utils/electronBridge'
import {
  grpcCheckAllowSecretLocal,
  grpcFetchBuildInYakVersion,
  grpcFetchLatestYakitVersion,
  grpcFetchLocalYakitVersion,
  grpcFetchLocalYakVersion,
  grpcFetchLocalYakVersionHash,
  grpcFetchSpecifiedYakVersionHash,
} from '../../../grpc'
import { LocalEngine } from '../index'
import type { LocalEngineLinkFuncProps, LocalEngineProps } from '../LocalEngineType'

vi.mock('../../../grpc', () => ({
  grpcCheckAllowSecretLocal: vi.fn(),
  grpcFetchBuildInYakVersion: vi.fn(),
  grpcFetchLatestYakitVersion: vi.fn(),
  grpcFetchLocalYakitVersion: vi.fn(),
  grpcFetchLocalYakVersion: vi.fn(),
  grpcFetchLocalYakVersionHash: vi.fn(),
  grpcFetchSpecifiedYakVersionHash: vi.fn(),
}))

vi.mock('@/utils/envfile', () => ({
  __PLATFORM__: 'enterprise',
  FetchSoftwareVersion: vi.fn(() => 'yakit'),
}))

vi.mock('@/utils/logCollection', () => ({
  debugToPrintLog: vi.fn(),
}))

vi.mock('@/utils/electronBridge', () => ({
  yakitEngine: {
    getCurrentYak: vi.fn(),
    getEngineLifecycleInfo: vi.fn(),
    onStartUpEngineMessage: vi.fn(() => vi.fn()),
  },
}))

describe('本地引擎离线启动', () => {
  let props: LocalEngineProps
  let ref: React.RefObject<LocalEngineLinkFuncProps>

  beforeEach(() => {
    vi.clearAllMocks()
    props = {
      setLog: vi.fn(),
      onLinkEngine: vi.fn(),
      yakitStatus: '',
      setYakitStatus: vi.fn(),
      buildInEngineVersion: '1.4.8-beta3',
      setRestartLoading: vi.fn(),
      yakitUpdate: false,
      setYakitUpdate: vi.fn(),
    }
    ref = React.createRef<LocalEngineLinkFuncProps>()
    ;(grpcCheckAllowSecretLocal as any).mockResolvedValue({
      ok: true,
      status: 'success',
      json: { port: 9011, secret: 'test-secret', version: '1.4.8-beta3' },
    })
    ;(yakitEngine.getCurrentYak as any).mockResolvedValue('1.4.8-beta3')
    ;(yakitEngine.getEngineLifecycleInfo as any).mockResolvedValue({
      installed: true,
      recovery: { recovered: false, source: 'active' },
      bundled: { exists: true, trusted: true, version: '1.4.8-beta3', status: 'verified-local-artifact' },
      compatibility: {
        clientVersion: '1.4.8-0711',
        minimumEngineVersion: 'TBD',
        recommendedEngineVersion: '1.4.8-beta3',
        highestVerifiedEngineVersion: '1.4.8-beta3',
        compatibilityGate: 'check-secret-local-grpc',
      },
    })
    ;(yakitEngine.onStartUpEngineMessage as any).mockReturnValue(() => {})
  })

  const renderComponent = () => render(<LocalEngine ref={ref} {...props} />)

  const initialize = async () => {
    await waitFor(() => expect(ref.current).not.toBeNull())
    await act(async () => {
      await ref.current!.init(9011)
    })
  }

  it('能力检查通过后直接使用本地引擎', async () => {
    renderComponent()
    await initialize()

    expect(grpcCheckAllowSecretLocal).toHaveBeenCalledWith({
      port: 9011,
      softwareVersion: FetchSoftwareVersion(),
      version: 'enterprise',
    })
    expect(props.onLinkEngine).toHaveBeenCalledWith({ port: 9011, secret: 'test-secret' })
    expect(props.setYakitStatus).toHaveBeenCalledWith('')
  })

  it('断网启动不请求客户端版本、引擎版本或在线摘要', async () => {
    ;(grpcFetchLatestYakitVersion as any).mockRejectedValue(new Error('offline'))
    ;(grpcFetchSpecifiedYakVersionHash as any).mockRejectedValue(new Error('offline'))
    renderComponent()
    await initialize()

    expect(props.onLinkEngine).toHaveBeenCalledTimes(1)
    expect(grpcFetchLatestYakitVersion).not.toHaveBeenCalled()
    expect(grpcFetchLocalYakitVersion).not.toHaveBeenCalled()
    expect(grpcFetchBuildInYakVersion).not.toHaveBeenCalled()
    expect(grpcFetchLocalYakVersion).not.toHaveBeenCalled()
    expect(grpcFetchLocalYakVersionHash).not.toHaveBeenCalled()
    expect(grpcFetchSpecifiedYakVersionHash).not.toHaveBeenCalled()
    expect(yakitEngine.getEngineLifecycleInfo).toHaveBeenCalledTimes(1)
  })

  it('兼容但低于推荐版本时继续启动并记录后台更新', async () => {
    ;(grpcCheckAllowSecretLocal as any).mockResolvedValue({
      ok: true,
      status: 'success',
      json: { port: 9011, secret: 'test-secret', version: '1.4.8-beta2' },
    })
    renderComponent()
    await initialize()

    expect(props.onLinkEngine).toHaveBeenCalledWith({ port: 9011, secret: 'test-secret' })
    expect(props.setLog).toHaveBeenCalledWith([
      '本地引擎 1.4.8-beta2 兼容，推荐版本为 1.4.8-beta3',
      '当前版本继续启动，主界面将在后台检查更新',
    ])
  })

  it('低于已知最低版本时阻断本地启动', async () => {
    ;(yakitEngine.getEngineLifecycleInfo as any).mockResolvedValue({
      installed: true,
      recovery: { recovered: false, source: 'active' },
      bundled: { exists: false, trusted: false, version: '', status: 'missing' },
      compatibility: {
        clientVersion: '1.4.8-0711',
        minimumEngineVersion: '1.4.8-beta4',
        recommendedEngineVersion: '1.4.8-beta4',
        highestVerifiedEngineVersion: '1.4.8-beta4',
        compatibilityGate: 'check-secret-local-grpc',
      },
    })
    renderComponent()
    await initialize()

    expect(props.setYakitStatus).toHaveBeenCalledWith('old_version')
    expect(props.onLinkEngine).not.toHaveBeenCalled()
  })

  it('后续重连仍只执行本地能力检查', async () => {
    renderComponent()
    await waitFor(() => expect(ref.current).not.toBeNull())
    await act(async () => {
      await ref.current!.link(9022)
    })

    expect(grpcCheckAllowSecretLocal).toHaveBeenCalledWith({
      port: 9022,
      softwareVersion: FetchSoftwareVersion(),
      version: 'enterprise',
    })
    expect(props.onLinkEngine).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['timeout', 'check_timeout'],
    ['call_error', 'check_timeout'],
    ['old_version', 'old_version'],
    ['port_occupied', 'port_occupied_prev'],
    ['antivirus_blocked', 'antivirus_blocked'],
    ['database_error', 'database_error'],
    ['build_yak_error', 'skipAgreement_Install'],
    ['dial_error', 'skipAgreement_Install'],
    ['unexpected', 'allow-secret-error'],
  ])('将能力状态 %s 映射为可恢复界面状态 %s', async (status, expectedStatus) => {
    ;(grpcCheckAllowSecretLocal as any).mockResolvedValue({ ok: false, status, message: 'detail', json: null })
    renderComponent()
    await initialize()

    expect(props.setYakitStatus).toHaveBeenCalledWith(expectedStatus)
    expect(props.onLinkEngine).not.toHaveBeenCalled()
  })

  it('能力检查异常时提供恢复界面', async () => {
    ;(grpcCheckAllowSecretLocal as any).mockRejectedValue(new Error('check failed'))
    renderComponent()
    await initialize()

    expect(props.setYakitStatus).toHaveBeenCalledWith('allow-secret-error')
    expect(props.onLinkEngine).not.toHaveBeenCalled()
  })

  it('用户中断后不再发起能力检查', async () => {
    props.yakitStatus = 'break'
    renderComponent()
    await initialize()

    expect(grpcCheckAllowSecretLocal).not.toHaveBeenCalled()
    expect(props.onLinkEngine).not.toHaveBeenCalled()
  })

  it('显示主进程提供的真实启动步骤', async () => {
    let listener: ((message: string) => void) | undefined
    ;(yakitEngine.onStartUpEngineMessage as any).mockImplementation((callback) => {
      listener = callback
      return vi.fn()
    })
    renderComponent()

    act(() => listener?.('正在初始化数据库'))

    expect(props.setLog).toHaveBeenCalledWith(['正在初始化数据库'])
  })
})
