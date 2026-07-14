import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { yakitLogs } from '@/utils/electronBridge'
import { EngineLifecyclePanel } from '../index'

vi.mock('../EngineLifecyclePanel.module.scss', () => ({ default: {} }))

vi.mock('@/utils/electronBridge', () => ({
  yakitLogs: {
    openEngineLog: vi.fn(),
  },
}))

describe('通用引擎初始化面板', () => {
  const onAction = vi.fn()
  const onManualInstall = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('缺失引擎时只提供显式安装、远程连接和诊断入口', () => {
    render(
      <EngineLifecyclePanel
        lifecycle={{ state: 'missing', message: '未找到可用引擎' }}
        yakitStatus="installNetWork"
        logs={['本地引擎不存在', '预置工件不存在']}
        busy={false}
        buildInEngineVersion=""
        countdown={4}
        onAction={onAction}
        onManualInstall={onManualInstall}
      />,
    )

    expect(screen.getByText('需要选择引擎')).toBeInTheDocument()
    expect(screen.getByText('安装引擎')).toBeInTheDocument()
    expect(screen.getByText('选择远程引擎')).toBeInTheDocument()
    expect(screen.getByText('手工安装')).toBeInTheDocument()
    expect(screen.getByText('打开诊断日志')).toBeInTheDocument()
    expect(screen.queryByText(/Yakit|Yaklang/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('安装引擎'))
    fireEvent.click(screen.getByText('选择远程引擎'))
    fireEvent.click(screen.getByText('手工安装'))
    fireEvent.click(screen.getByText('打开诊断日志'))

    expect(onAction).toHaveBeenNthCalledWith(1, 'installNetWork')
    expect(onAction).toHaveBeenNthCalledWith(2, 'remote')
    expect(onManualInstall).toHaveBeenCalledTimes(1)
    expect(yakitLogs.openEngineLog).toHaveBeenCalledTimes(1)
  })

  it('展示下载进度与可恢复错误入口', () => {
    const { rerender } = render(
      <EngineLifecyclePanel
        lifecycle={{ state: 'downloading', message: '正在下载引擎', progress: 42 }}
        yakitStatus=""
        logs={['正在下载临时文件']}
        busy={true}
        buildInEngineVersion=""
        countdown={4}
        onAction={onAction}
        onManualInstall={onManualInstall}
      />,
    )

    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('正在下载临时文件')).toBeInTheDocument()

    rerender(
      <EngineLifecyclePanel
        lifecycle={{ state: 'recoverable-error', message: '更新失败', error: '摘要不匹配' }}
        yakitStatus="allow-secret-error"
        logs={['旧版本仍可使用']}
        busy={false}
        buildInEngineVersion=""
        countdown={4}
        onAction={onAction}
        onManualInstall={onManualInstall}
      />,
    )

    expect(screen.getByText('摘要不匹配')).toBeInTheDocument()
    expect(screen.getByText('重试启动')).toBeInTheDocument()
    expect(screen.getByText('手工安装')).toBeInTheDocument()
  })
})
