import React, { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YakPoC } from '../YakPoC'

vi.hoisted(() => {
  const asyncMethod = vi.fn().mockResolvedValue(undefined)
  const channel = new Proxy(asyncMethod, {
    get: (_target, key) => (key === 'then' ? undefined : asyncMethod),
  })
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: channel }),
  })
  Object.defineProperty(window, 'yakitBridge', {
    configurable: true,
    value: new Proxy({}, { get: () => channel }),
  })
})

const { queryPluginList, queryKeywordGroups, pluginEventBus } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  return {
    queryPluginList: vi.fn(),
    queryKeywordGroups: vi.fn(),
    pluginEventBus: {
      emit: vi.fn((event: string, ...args: unknown[]) => handlers.get(event)?.(...args)),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
      off: vi.fn((event: string) => handlers.delete(event)),
    },
  }
})

const plugin = {
  ScriptName: '专项检测插件',
  HeadImg: 'avatar.png',
  Help: '插件说明',
  Content: 'plugin source',
  OnlineOfficial: true,
  IsCorePlugin: false,
  Type: 'yak',
  OnlineBaseUrl: 'https://plugins.example.test',
  OnlineIsPrivate: false,
}

vi.mock('../YakPoC.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

vi.mock('ahooks', async () => {
  const actual = await vi.importActual<typeof import('ahooks')>('ahooks')
  return {
    ...actual,
    useDebounceFn: (fn: (...args: unknown[]) => unknown) => ({ run: fn }),
    useInViewport: () => [true],
  }
})

vi.mock('@/store/pageInfo', () => ({
  usePageInfo: (
    selector: (state: {
      queryPagesDataById: () => {
        pageParamsInfo: {
          pocPageInfo: {
            selectGroup: string[]
            selectGroupListByKeyWord: string[]
            formValue: Record<string, unknown>
            https: boolean
            httpFlowIds: string[]
            request: Uint8Array
            runtimeId: string
            hybridScanMode: string
            defGroupKeywords: string
          }
        }
      }
    }) => unknown,
  ) =>
    selector({
      queryPagesDataById: () => ({
        pageParamsInfo: {
          pocPageInfo: {
            selectGroup: [],
            selectGroupListByKeyWord: ['Java'],
            formValue: {},
            https: false,
            httpFlowIds: [],
            request: new Uint8Array(),
            runtimeId: '',
            hybridScanMode: 'new',
            defGroupKeywords: '',
          },
        },
      }),
    }),
}))

vi.mock('@/pages/plugins/utils', () => ({
  apiFetchDeleteYakScriptGroupLocal: vi.fn().mockResolvedValue(undefined),
  apiFetchQueryYakScriptGroupLocal: vi.fn().mockResolvedValue([]),
  apiFetchSaveYakScriptGroupLocal: vi.fn().mockResolvedValue(undefined),
  apiQueryYakScript: queryPluginList,
  hybridScanParamsConvertToInputValue: vi.fn(),
}))

vi.mock('@/pages/securityTool/yakPoC/utils', () => ({
  apiFetchQueryYakScriptGroupLocalByPoc: queryKeywordGroups,
}))

vi.mock('@/pages/plugins/baseTemplate', () => ({
  PluginDetailsListItem: ({
    pluginName,
    displayMode,
  }: {
    pluginName: string
    displayMode?: 'default' | 'name-only'
  }) => (
    <div data-testid="selected-plugin-row" data-display-mode={displayMode}>
      {pluginName}
    </div>
  ),
}))

vi.mock('@/pages/plugins/pluginBatchExecutor/pluginBatchExecutor', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    HybridScanExecuteContent: react.forwardRef((_props, ref) => {
      react.useImperativeHandle(ref, () => ({
        onInitInputValue: vi.fn(),
        onActionHybridScanByRuntimeId: vi.fn().mockResolvedValue(undefined),
        onStopExecute: vi.fn(),
        onStartExecute: vi.fn(),
        onPause: vi.fn(),
        onContinue: vi.fn(),
      }))
      return <div data-testid="hybrid-scan-content" />
    }),
  }
})

vi.mock('@/components/RollingLoadList/RollingLoadList', () => ({
  RollingLoadList: ({
    data,
    renderRow,
  }: {
    data: unknown[]
    renderRow: (item: unknown, index: number) => ReactNode
  }) => (
    <div>
      {data.map((item, index) => (
        <React.Fragment key={index}>{renderRow(item, index)}</React.Fragment>
      ))}
    </div>
  ),
}))

vi.mock('@/pages/plugins/operator/expandAndRetract/ExpandAndRetract', () => ({
  ExpandAndRetract: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/pages/plugins/operator/localPluginExecuteDetailHeard/LocalPluginExecuteDetailHeard', () => ({
  PluginExecuteProgress: () => null,
}))

vi.mock('@/defaultConstants/PluginBatchExecutor', () => ({
  batchPluginType: 'mitm,port-scan,nuclei',
}))

vi.mock('@/pages/yakitStore/viewers/base', () => ({
  compareAsc: (left: { Index: number }, right: { Index: number }) => left.Index - right.Index,
}))

vi.mock('@/components/yakitUI/YakitRadioButtons/YakitRadioButtons', () => ({
  YakitRadioButtons: ({
    options,
  }: {
    options: Array<{
      value: string
      label: ReactNode
    }>
  }) => (
    <div>
      {options.map((option) => (
        <span key={option.value}>{option.label}</span>
      ))}
    </div>
  ),
}))

vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/yakitUI/YakitCheckbox/YakitCheckbox', () => ({
  YakitCheckbox: ({ children }: { children?: ReactNode }) => (
    <label>
      <input type="checkbox" />
      {children}
    </label>
  ),
}))

vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => ({
  YakitInput: {
    Search: (props: { value?: string; placeholder?: string }) => (
      <input value={props.value} placeholder={props.placeholder} readOnly />
    ),
  },
}))

vi.mock('@/components/yakitUI/YakitAutoComplete/YakitAutoComplete', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    YakitAutoComplete: react.forwardRef(({ children }: { children: ReactNode }, ref) => {
      react.useImperativeHandle(ref, () => ({ onSetRemoteValues: vi.fn() }))
      return <>{children}</>
    }),
    defYakitAutoCompleteRef: { onSetRemoteValues: vi.fn() },
  }
})

vi.mock('@/components/yakitUI/YakitEmpty/YakitEmpty', () => ({
  YakitEmpty: ({ title, description }: { title?: ReactNode; description?: ReactNode }) => (
    <div>
      {title}
      {description}
    </div>
  ),
}))

vi.mock('@/components/yakitUI/YakitSpin/YakitSpin', () => ({
  YakitSpin: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('@/pages/mitm/MITMServerHijacking/MITMPluginLocalList', () => ({
  YakitGetOnlinePlugin: ({
    visible,
    setVisible,
    onFinish,
  }: {
    visible: boolean
    setVisible: (visible: boolean) => void
    onFinish?: () => void | Promise<void>
  }) =>
    visible ? (
      <button
        type="button"
        onClick={() => {
          void Promise.resolve(onFinish?.()).then(() => {
            setVisible(false)
            pluginEventBus.emit('onRefreshLocalPluginList', true)
          })
        }}
      >
        完成下载
      </button>
    ) : null,
}))

vi.mock('@/components/renyanUI', () => ({
  RuiYanIcon: () => <svg aria-hidden="true" />,
  RuiYanSegmented: ({ items }: { items: Array<{ label: ReactNode; value: string }> }) => (
    <div>
      {items.map((item) => (
        <span key={item.value}>{item.label}</span>
      ))}
    </div>
  ),
}))

vi.mock('@/assets/icon/colors', () => ({
  FolderColorIcon: () => <svg aria-hidden="true" />,
  SolidCloudpluginIcon: () => <svg aria-hidden="true" />,
  SolidPrivatepluginIcon: () => <svg aria-hidden="true" />,
}))

vi.mock('@/assets/icon/outline', () => ({
  OutlineArrowscollapseIcon: () => <svg aria-hidden="true" />,
  OutlineArrowsexpandIcon: () => <svg aria-hidden="true" />,
  OutlineCloseIcon: () => <svg aria-hidden="true" />,
  OutlineCogIcon: () => <svg aria-hidden="true" />,
  OutlineOpenIcon: () => <svg aria-hidden="true" />,
}))

vi.mock('@/assets/newIcon', () => ({
  CloudDownloadIcon: () => <svg aria-hidden="true" />,
}))

vi.mock('@/utils/kv', () => ({
  getRemoteValue: vi.fn().mockResolvedValue(''),
  setRemoteValue: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/utils/envfile', async () => {
  const actual = await vi.importActual<typeof import('@/utils/envfile')>('@/utils/envfile')
  return {
    ...actual,
    getReleaseEditionName: () => '睿眼',
    getRemoteHttpSettingGV: () => 'remote-setting',
  }
})

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: pluginEventBus,
}))

vi.mock('@/utils/clipboard', () => ({
  getClipboardText: vi.fn().mockResolvedValue(''),
  setClipboardText: vi.fn(),
}))

vi.mock('@/i18n/useI18nNamespaces', () => {
  const translations: Record<string, string> = {
    'YakPoC.byKeyword': '按关键词',
    'YakPoC.byGroup': '按组选',
    'YakPoCExecuteContent.selectedPlugin': '已选插件',
    'YakPoCExecuteContent.pluginLog': '插件日志',
    'YakPoCExecuteContent.pluginExecute': '插件执行',
    'YakPoCExecuteContent.taskList': '任务列表',
    'YakitButton.clear': '清空',
    'YakitButton.oneClickDownload': '一键下载',
    'YakitEmpty.noData': '暂无数据',
    'PluginGroupByKeyWord.noDataDesc': '可下载默认关键词与插件',
  }
  return {
    useI18nNamespaces: () => ({
      t: (key: string) => translations[key] || key,
      i18n: { language: 'zh-CN' },
    }),
  }
})

describe('YakPoC 插件展示', () => {
  beforeEach(() => {
    queryKeywordGroups.mockReset()
    queryPluginList.mockReset()
    pluginEventBus.emit.mockClear()
    pluginEventBus.on.mockClear()
    pluginEventBus.off.mockClear()
  })

  it('已选插件面板只显示插件名称且不提供插件日志页签', async () => {
    queryKeywordGroups.mockResolvedValue([{ Value: 'Java', Total: 1 }])
    queryPluginList.mockResolvedValue({
      Pagination: { Page: 1, Limit: 20, OrderBy: '', Order: '' },
      Total: 1,
      Data: [plugin],
    })

    render(<YakPoC pageId="poc-page" />)

    expect(screen.getAllByText('已选插件').length).toBeGreaterThan(0)
    expect(screen.queryByText('插件日志')).not.toBeInTheDocument()
    expect(screen.getByTestId('hybrid-scan-content')).toBeInTheDocument()

    const pluginRow = await screen.findByTestId('selected-plugin-row')
    expect(pluginRow).toHaveTextContent(plugin.ScriptName)
    expect(pluginRow).toHaveAttribute('data-display-mode', 'name-only')

    await waitFor(() => {
      expect(queryPluginList).toHaveBeenCalled()
    })
  })

  it('首次下载完成后在当前页面重新读取并显示关键词分类', async () => {
    queryKeywordGroups
      .mockResolvedValue([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ Value: 'Java', Total: 1 }])
    queryPluginList.mockResolvedValue({
      Pagination: { Page: 1, Limit: 20, OrderBy: '', Order: '' },
      Total: 0,
      Data: [],
    })

    render(<YakPoC pageId="poc-page" />)

    await waitFor(() => {
      expect(queryKeywordGroups).toHaveBeenCalledTimes(1)
    })
    fireEvent.click(screen.getByRole('button', { name: '一键下载' }))
    fireEvent.click(screen.getByRole('button', { name: '完成下载' }))

    expect(await screen.findByText('Java', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(queryKeywordGroups).toHaveBeenCalledTimes(3)
    await waitFor(() => {
      expect(queryPluginList).toHaveBeenCalledTimes(2)
    })
  })
})
