import React, { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YakitGetOnlinePlugin } from '../MITMPluginLocalList'

const { eventHandlers, ipcRenderer, emit, yakitNotify } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const renderer = {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      handlers.set(channel, handler)
    }),
    removeAllListeners: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
  }

  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: renderer }),
  })
  Object.defineProperty(window, 'yakitBridge', {
    configurable: true,
    value: new Proxy(
      {},
      {
        get: () => new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) }),
      },
    ),
  })

  return {
    eventHandlers: handlers,
    ipcRenderer: renderer,
    emit: vi.fn(),
    yakitNotify: vi.fn(),
  }
})

vi.mock('../../MITMPage.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

vi.mock('@/utils/randomUtil', () => ({
  randomString: () => 'download-token',
}))

vi.mock('@/utils/notification', () => ({
  failed: vi.fn(),
  yakitNotify,
}))

vi.mock('@/utils/envfile', () => ({
  getReleaseEditionName: () => '睿眼',
  isCommunityEdition: () => true,
  isEnpriTraceAgent: () => false,
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: { emit },
}))

vi.mock('@/components/yakitUI/YakitHint/YakitHint', () => ({
  YakitHint: ({
    visible,
    title,
    children,
    okButtonText,
    okButtonProps,
    onOk,
  }: {
    visible: boolean
    title?: ReactNode
    children: ReactNode
    okButtonText?: ReactNode
    okButtonProps?: { style?: React.CSSProperties }
    onOk?: () => void
  }) =>
    visible ? (
      <div data-testid="download-hint">
        <div>{title}</div>
        {children}
        {okButtonProps?.style?.display === 'none' ? null : (
          <button type="button" onClick={onOk}>
            {okButtonText}
          </button>
        )}
      </div>
    ) : null,
}))

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd')
  return {
    ...actual,
    Progress: ({ percent, format }: { percent: number; format?: (percent: number) => ReactNode }) => (
      <div data-testid="download-progress">{format ? format(percent) : percent}</div>
    ),
  }
})

vi.mock('@/assets/newIcon', () => ({
  ChevronDownIcon: () => null,
  ChevronUpIcon: () => null,
  CloudDownloadIcon: () => null,
  FolderOpenIcon: () => null,
  ImportIcon: () => null,
  SolidCloudDownloadIcon: () => null,
}))

vi.mock('@/pages/yakitStore/YakitStorePage', () => ({
  YakModuleList: () => null,
}))

vi.mock('react-resize-detector', () => ({
  default: () => null,
}))

vi.mock('@/components/yakitUI/YakitCheckbox/YakitCheckbox', () => ({
  YakitCheckbox: () => null,
}))

vi.mock('@/components/yakitUI/YakitTag/YakitTag', () => ({
  YakitTag: () => null,
}))

vi.mock('@/components/yakitUI/YakitEmpty/YakitEmpty', () => ({
  YakitEmpty: () => null,
}))

vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: () => null,
}))

vi.mock('@/components/YakitCombinationSearch/YakitCombinationSearch', () => ({
  YakitCombinationSearch: () => null,
}))

vi.mock('../../MITMPage', () => ({
  ImportLocalPlugin: () => null,
}))

vi.mock('../../MITMYakScriptLoader', () => ({
  MITMYakScriptLoader: () => null,
}))

vi.mock('@/pages/pluginHub/group/UpdateGroupList', () => ({
  UpdateGroupList: () => null,
}))

vi.mock('@/pages/pluginHub/group/PluginOperationGroupList', () => ({
  DelGroupConfirmPop: () => null,
}))

vi.mock('@/pages/plugins/utils', () => ({
  apiFetchDeleteYakScriptGroupLocal: vi.fn(),
  apiFetchDeleteYakScriptGroupOnline: vi.fn(),
  apiFetchGetYakScriptGroupLocal: vi.fn(),
  apiFetchGetYakScriptGroupOnline: vi.fn(),
  apiFetchQueryYakScriptGroupLocal: vi.fn(),
  apiFetchQueryYakScriptGroupOnlineNotLoggedIn: vi.fn(),
  apiFetchRenameYakScriptGroupLocal: vi.fn(),
  apiFetchRenameYakScriptGroupOnline: vi.fn(),
  apiFetchSaveYakScriptGroupLocal: vi.fn(),
  apiFetchSaveYakScriptGroupOnline: vi.fn(),
  apiQueryYakScript: vi.fn(),
}))

vi.mock('@/hook/useCompare/useCompare', () => ({
  useCampare: () => false,
}))

vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => ({
  YakitInput: () => null,
}))

vi.mock('@/assets/icon/outline', () => ({
  OutlinePencilaltIcon: () => null,
  OutlineTrashIcon: () => null,
}))

vi.mock('@/components/yakitUI/YakitPopover/YakitPopover', () => ({
  YakitPopover: () => null,
}))

vi.mock('@/utils/kv', () => ({
  getRemoteValue: vi.fn().mockResolvedValue(''),
  setRemoteValue: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/yakitGV', () => ({
  RemoteGV: {},
}))

vi.mock('@/enums/yakitRoute', () => ({
  YakitRoute: { MITMHacker: 'mitm-hacker' },
}))

const triggerDownloadEnd = () => {
  const handler = eventHandlers.get('download-token-end')
  expect(handler).toBeDefined()
  act(() => {
    handler?.()
  })
}

describe('YakitGetOnlinePlugin', () => {
  beforeEach(() => {
    eventHandlers.clear()
    ipcRenderer.invoke.mockClear()
    ipcRenderer.on.mockClear()
    ipcRenderer.removeAllListeners.mockClear()
    emit.mockClear()
    yakitNotify.mockClear()
  })

  it('下载流结束后等待页面刷新完成再关闭提示', async () => {
    let resolveRefresh: (() => void) | undefined
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve
    })
    const onFinish = vi.fn(() => refreshPromise)
    const setVisible = vi.fn()

    render(<YakitGetOnlinePlugin visible setVisible={setVisible} onFinish={onFinish} />)

    await waitFor(() => {
      expect(eventHandlers.has('download-token-end')).toBe(true)
    })
    triggerDownloadEnd()

    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1)
    })
    expect(setVisible).not.toHaveBeenCalled()

    await act(async () => {
      resolveRefresh?.()
      await refreshPromise
    })

    await waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(false)
    })
    expect(emit).toHaveBeenCalledWith('onRefreshLocalPluginList', true)
  })

  it('下载结束后允许页面展示运行时激活阶段', async () => {
    let resolveActivation: (() => void) | undefined
    const activationPromise = new Promise<void>((resolve) => {
      resolveActivation = resolve
    })
    const onFinish = vi.fn((updateStatus?: (message: string) => void) => {
      updateStatus?.('正在刷新专项检测插件索引')
      return activationPromise
    })
    const setVisible = vi.fn()

    render(<YakitGetOnlinePlugin visible setVisible={setVisible} onFinish={onFinish} />)

    await waitFor(() => {
      expect(eventHandlers.has('download-token-end')).toBe(true)
    })
    triggerDownloadEnd()

    expect(await waitFor(() => document.body.textContent)).toContain('正在刷新专项检测插件索引')
    expect(setVisible).not.toHaveBeenCalled()

    await act(async () => {
      resolveActivation?.()
      await activationPromise
    })
  })

  it('运行环境刷新失败后仅重试激活流程且不重复下载', async () => {
    const onFinish = vi.fn().mockRejectedValueOnce(new Error('query failed')).mockResolvedValueOnce(undefined)
    const setVisible = vi.fn()

    render(<YakitGetOnlinePlugin visible setVisible={setVisible} onFinish={onFinish} />)

    await waitFor(() => {
      expect(eventHandlers.has('download-token-end')).toBe(true)
    })
    triggerDownloadEnd()

    await waitFor(() => {
      expect(yakitNotify).toHaveBeenCalledWith('error', expect.stringContaining('插件已导入，但插件运行环境刷新失败'))
    })
    expect(setVisible).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '重试加载' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试加载' }))

    await waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(false)
    })
    expect(onFinish).toHaveBeenCalledTimes(2)
    const downloadCalls = ipcRenderer.invoke.mock.calls.filter(([channel]) => channel === 'DownloadOnlinePlugins')
    expect(downloadCalls).toHaveLength(1)
  })

  it('下载流失败时返回可重试页面且不发送成功刷新事件', async () => {
    const onFinish = vi.fn()
    const setVisible = vi.fn()

    render(<YakitGetOnlinePlugin visible setVisible={setVisible} onFinish={onFinish} />)

    await waitFor(() => {
      expect(eventHandlers.has('download-token-error')).toBe(true)
    })
    act(() => {
      eventHandlers.get('download-token-error')?.({}, 'network unavailable')
    })

    expect(onFinish).not.toHaveBeenCalled()
    expect(yakitNotify).toHaveBeenCalledWith('error', '下载失败:network unavailable')
    expect(setVisible).toHaveBeenCalledWith(false)
    expect(emit).not.toHaveBeenCalled()
  })

  it('重复结束事件只执行一次刷新', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined)
    const setVisible = vi.fn()

    render(<YakitGetOnlinePlugin visible setVisible={setVisible} onFinish={onFinish} />)

    await waitFor(() => {
      expect(eventHandlers.has('download-token-end')).toBe(true)
    })
    triggerDownloadEnd()
    triggerDownloadEnd()

    await waitFor(() => {
      expect(setVisible).toHaveBeenCalledWith(false)
    })
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(setVisible).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('组件卸载后不再关闭页面状态并清理任务监听器', async () => {
    let resolveRefresh: (() => void) | undefined
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve
    })
    const onFinish = vi.fn(() => refreshPromise)
    const setVisible = vi.fn()
    const { unmount } = render(<YakitGetOnlinePlugin visible setVisible={setVisible} onFinish={onFinish} />)

    await waitFor(() => {
      expect(eventHandlers.has('download-token-end')).toBe(true)
    })
    triggerDownloadEnd()
    await waitFor(() => {
      expect(onFinish).toHaveBeenCalledTimes(1)
    })

    unmount()
    await act(async () => {
      resolveRefresh?.()
      await refreshPromise
    })

    expect(setVisible).not.toHaveBeenCalled()
    expect(ipcRenderer.removeAllListeners).toHaveBeenCalledWith('download-token-data')
    expect(ipcRenderer.removeAllListeners).toHaveBeenCalledWith('download-token-error')
    expect(ipcRenderer.removeAllListeners).toHaveBeenCalledWith('download-token-end')
  })
})
