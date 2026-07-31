import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from '@/store'
import type { Risk } from '../../schema'
import type { PreparedTeamShare } from '@/pages/teamCollaboration/sharedRecordAdapters'
import { defQueryRisksRequest } from '../constants'

var ipcInvokeMock = vi.fn()
var resolveShareableRiskHTTPFlowIdMock = vi.fn()
var serializeSharedRiskMock = vi.fn()
var prepareSharedRiskMock = vi.fn()
var prepareHTTPFlowForTeamShareMock = vi.fn()
var useTeamShareAccessMock = vi.fn()
var teamShareBeginMock = vi.fn()
var showByRightContextMock = vi.fn()
var shareModalPropsMock = vi.fn()
var riskTablePropsMock = vi.fn()

vi.mock('../YakitRiskTable.module.scss', () => ({ default: {} }))

vi.mock('@/components/yakitUI/YakitPopconfirm/YakitPopconfirm', () => ({
  YakitPopconfirm: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button type="button" {...props}>
      {icon}
      {children}
    </button>
  ),
}))

vi.mock('@/assets/icon/outline', () => ({
  OutlineChevrondownIcon: () => null,
  OutlineChevronleftIcon: () => null,
  OutlineChevronrightIcon: () => null,
  OutlineClockIcon: () => null,
  OutlineExportIcon: () => null,
  OutlineEyeIcon: () => null,
  OutlineOpenIcon: () => null,
  OutlinePlayIcon: () => null,
  OutlineRefreshIcon: () => null,
  OutlineSearchIcon: () => null,
  OutlineTerminalIcon: () => null,
  OutlineTrashIcon: () => null,
  OutlineUploadIcon: () => null,
}))

vi.mock('@/components/yakitUI/YakitRadioButtons/YakitRadioButtons', () => ({
  YakitRadioButtons: () => null,
}))

vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => {
  const Search = () => null
  return { YakitInput: Object.assign(() => null, { Search }) }
})

vi.mock('@/components/yakitUI/YakitDropdownMenu/YakitDropdownMenu', () => ({
  YakitDropdownMenu: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/yakitUI/YakitTag/YakitTag', () => ({
  CopyComponents: () => null,
  YakitTag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/yakitUI/YakitSelect/YakitSelect', () => {
  const Option = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  return { YakitSelect: Object.assign(({ children }: { children?: React.ReactNode }) => <>{children}</>, { Option }) }
})

vi.mock('@/components/yakitUI/YakitModal/YakitModalConfirm', () => ({
  showYakitModal: () => ({ destroy: vi.fn() }),
}))

vi.mock('@/components/DataExport/DataExport', () => ({
  ExportSelect: () => null,
}))

vi.mock('@/components/renyanUI', () => ({
  RuiYanDetailPanel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  RuiYanPageHeader: () => null,
  RuiYanToolbar: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/yakitUI/YakitSpin/YakitSpin', () => ({
  YakitSpin: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock('react-resize-detector', () => ({
  default: function ResizeDetectorMock({ onResize }: { onResize?: (width?: number, height?: number) => void }) {
    React.useEffect(() => {
      onResize?.(800, 560)
    }, [onResize])
    return null
  },
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {},
}))

vi.mock('@/services/electronBridge', () => ({
  yakitApp: {
    userSignOut: vi.fn(),
  },
  yakitNetwork: {
    axiosApi: vi.fn(),
    logoutDynamicControl: vi.fn(),
  },
  yakitPlugin: {
    deleteByUserId: vi.fn(),
  },
  yakitRelease: {
    setEditionRaw: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/hook/useTheme', () => ({
  useTheme: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { theme: 'light', setTheme: vi.fn(), syncTheme: vi.fn() }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    i18n: { language: 'zh' },
    t: (key: string) => key,
  }),
}))

vi.mock('@/utils/notification', () => ({
  yakitNotify: vi.fn(),
}))

vi.mock('@/utils/openWebsite', () => ({
  minWinSendToChildWin: vi.fn(),
  openRiskNewWindow: vi.fn(),
}))

vi.mock('@/utils/kv', () => ({
  getRemoteValue: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: {
    emit: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
  },
}))

vi.mock('@/store/pageInfo', () => ({
  usePageInfo: (selector: (state: { currentPageTabRouteKey: string }) => unknown) =>
    selector({ currentPageTabRouteKey: 'risk-test-page' }),
}))

vi.mock('@/pages/teamCollaboration/sharedRecordAdapters', () => ({
  resolveShareableRiskHTTPFlowId: (...args: unknown[]) => resolveShareableRiskHTTPFlowIdMock(...args),
  serializeSharedRisk: (...args: unknown[]) => serializeSharedRiskMock(...args),
  prepareSharedRisk: (...args: unknown[]) => prepareSharedRiskMock(...args),
}))

vi.mock('@/components/HTTPFlowTable/useHTTPFlowTableContextMenu', () => ({
  prepareHTTPFlowForTeamShare: (...args: unknown[]) => prepareHTTPFlowForTeamShareMock(...args),
  useTeamShareAccess: (...args: unknown[]) => useTeamShareAccessMock(...args),
}))

vi.mock('@/components/yakitUI/YakitMenu/showByRightContext', () => ({
  showByRightContext: (...args: unknown[]) => showByRightContextMock(...args),
}))

vi.mock('@/components/TableVirtualResize/TableVirtualResize', () => ({
  TableVirtualResize: (props: Record<string, unknown>) => {
    riskTablePropsMock(props)
    const data = props.data as Risk[]
    const row = data[0]
    const rowSelection = props.rowSelection as {
      onChangeCheckboxSingle: (checked: boolean, key: string, risk: Risk) => void
    }
    return row ? (
      <div>
        <button type="button" onContextMenu={() => (props.onRowContextMenu as (risk: Risk) => void)(row)}>
          风险行
        </button>
        <button type="button" onClick={() => rowSelection.onChangeCheckboxSingle(true, String(row.Id), row)}>
          选择风险
        </button>
      </div>
    ) : null
  },
}))

vi.mock('@/components/yakitUI/YakitResizeBox/YakitResizeBox', () => ({
  YakitResizeBox: ({ firstNode, secondNode }: { firstNode: React.ReactNode; secondNode?: React.ReactNode }) => (
    <div>
      {firstNode}
      {secondNode}
    </div>
  ),
}))

vi.mock('@/utils/editors', () => ({
  NewHTTPPacketEditor: () => null,
}))

vi.mock('@/components/yakitUI/YakitEditor/YakitEditor', () => ({
  YakitEditor: () => null,
}))

vi.mock('@/components/yakCodemirror/YakCodemirror', () => ({
  YakCodemirror: () => null,
}))

vi.mock('@/components/HTTPFlowTable/HTTPFlowTable', () => ({}))
vi.mock('@/pages/risks/RiskTable', () => ({}))
vi.mock('../../RiskTable', () => ({}))

vi.mock('@/pages/plugins/funcTemplate', () => ({
  FuncBtn: ({ name, ...props }: { name?: React.ReactNode }) => (
    <button type="button" {...props}>
      {name}
    </button>
  ),
}))

vi.mock('@/pages/pluginHub/utils/grpc', () => ({
  grpcFetchLocalPluginDetail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/utils/duplex/duplex', () => ({
  serverPushStatus: false,
}))

vi.mock('@/pages/pluginHub/hooks/useListenWidth', () => ({
  default: () => 0,
}))

vi.mock('@/pages/yakRunner/CollapseList/CollapseList', () => ({
  CollapseList: () => null,
}))

vi.mock('@/pages/assetViewer/reportRenders/markdownRender', () => ({
  SafeMarkdown: () => null,
}))

vi.mock('@/pages/pluginHub/utilsUI/UtilsTemplate', () => ({
  NoPromptHint: () => null,
}))

vi.mock('@/pages/yakRunnerAuditCode/utils', () => ({
  loadAuditFromYakURLRaw: vi.fn(),
}))

vi.mock('@/pages/yakRunnerAuditCode/RightAuditDetail/RightAuditDetail', () => ({}))
vi.mock('@/pages/yakRunnerAuditCode/BottomEditorDetails/BottomEditorDetailsType', () => ({}))
vi.mock('@/pages/yakRunnerAuditCode/RunnerTabs/RunnerTabsType', () => ({}))
vi.mock('@/pages/yakRunner/utils', () => ({
  getNameByPath: (value: string) => value,
}))

vi.mock('@/pages/teamCollaboration/ShareToTeamProjectModal', () => ({
  ShareToTeamProjectModal: (props: {
    visible: boolean
    prepared: PreparedTeamShare
    onSuccess: (target: { teamId: number; projectId: number }) => void
  }) => {
    shareModalPropsMock(props)
    return props.visible ? (
      <button type="button" onClick={() => props.onSuccess({ teamId: 1, projectId: 21 })}>
        完成团队分享
      </button>
    ) : null
  },
}))

type UtilsModule = typeof import('../utils')
let utilsModule: UtilsModule
type RiskTableModule = typeof import('../YakitRiskTable')
let riskTableModule: RiskTableModule

const createRisk = (overrides: Partial<Risk> = {}): Risk => ({
  Id: 202,
  Hash: 'risk-hash',
  IP: '127.0.0.1',
  Title: 'Fresh risk title',
  RiskType: 'sql-injection',
  Severity: 'high',
  CreatedAt: 1_754_000_000,
  PacketPairs: [{ HttpflowId: 101 }],
  ...overrides,
})

const createHTTPPrepared = (): PreparedTeamShare => ({
  kind: 'http-flow',
  http: {
    sourceClientId: 'desktop-client-7',
    localFlowId: '101',
    flowKey: 'a'.repeat(64),
    content: '{}',
    contentHash: 'b'.repeat(64),
    name: 'HTTP Flow 101',
    request: { raw_base64: 'AQ==', byte_length: 1, sha256: 'c'.repeat(64) },
    response: { raw_base64: 'Ag==', byte_length: 1, sha256: 'd'.repeat(64) },
    summary: {
      method: 'GET',
      url: 'https://fresh.example/',
      host: 'fresh.example:443',
      status_code: 200,
    },
  },
})

beforeAll(async () => {
  Object.defineProperty(window, 'yakitBridge', {
    configurable: true,
    value: new Proxy({}, { get: () => vi.fn() }),
  })
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: { invoke: ipcInvokeMock } }),
  })
  utilsModule = await import('../utils')
  riskTableModule = await import('../YakitRiskTable')
}, 30_000)

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    userInfo: {
      ...useStore.getState().userInfo,
      isLogin: true,
      user_id: 7,
      token: 'token-a',
    },
  })
  ipcInvokeMock.mockReset().mockImplementation((channel: string) => {
    if (channel === 'QueryRiskTags') return Promise.resolve({ RiskTags: [] })
    if (channel === 'QueryAvailableRiskType') return Promise.resolve({ Values: [] })
    return Promise.resolve({
      Data: [createRisk()],
      Total: 1,
      Pagination: { Page: 1, Limit: 20 },
    })
  })
  teamShareBeginMock.mockResolvedValue({ isCurrent: () => true })
  useTeamShareAccessMock.mockReturnValue({ available: true, begin: teamShareBeginMock })
  showByRightContextMock.mockReturnValue({ destroy: vi.fn() })
  resolveShareableRiskHTTPFlowIdMock.mockReturnValue(101)
  prepareHTTPFlowForTeamShareMock.mockResolvedValue(createHTTPPrepared())
  serializeSharedRiskMock.mockResolvedValue(new Uint8Array([7, 8, 9]))
  prepareSharedRiskMock.mockResolvedValue({
    sourceClientId: 'desktop-client-7',
    localRiskId: '202',
    riskKey: 'e'.repeat(64),
    flowKey: 'a'.repeat(64),
    content: '{}',
    contentHash: 'f'.repeat(64),
    name: 'Risk 202',
    payload: { raw_base64: 'BwgJ', byte_length: 3, sha256: '1'.repeat(64) },
    summary: { title: 'Fresh risk title', severity: 'high', risk_type: 'sql-injection' },
  })
})

const renderRiskTable = () => {
  const RiskTable = riskTableModule.YakitRiskTable
  return render(<RiskTable setRiskLoading={vi.fn()} query={{ ...defQueryRisksRequest }} setQuery={vi.fn()} />)
}

describe('Risk 团队分享准备', () => {
  test('只用精确 Ids 查询并要求唯一且 ID 相同的鲜活 Risk', async () => {
    await expect(utilsModule.apiQueryUniqueRiskById(202)).resolves.toMatchObject({ Id: 202 })
    expect(ipcInvokeMock).toHaveBeenCalledWith('QueryRisks', { Ids: [202] })

    for (const Data of [[], [createRisk(), createRisk({ Id: 203 })], [createRisk({ Id: 203 })]]) {
      ipcInvokeMock.mockResolvedValueOnce({ Data, Total: Data.length, Pagination: { Page: 1, Limit: 1 } })
      await expect(utilsModule.apiQueryUniqueRiskById(202)).rejects.toThrow()
    }
  })

  test('先准备唯一关联 HTTP，再序列化鲜活 Risk 并沿用同一客户端和 flowKey', async () => {
    const order: string[] = []
    prepareHTTPFlowForTeamShareMock.mockImplementation(async () => {
      order.push('http')
      return createHTTPPrepared()
    })
    serializeSharedRiskMock.mockImplementation(async () => {
      order.push('serialize-risk')
      return new Uint8Array([7, 8, 9])
    })
    prepareSharedRiskMock.mockImplementation(async (input) => {
      order.push('prepare-risk')
      return {
        sourceClientId: input.clientId,
        localRiskId: input.localRiskId,
        riskKey: 'e'.repeat(64),
        flowKey: input.flowKey,
        content: '{}',
        contentHash: 'f'.repeat(64),
        name: 'Risk 202',
        payload: { raw_base64: 'BwgJ', byte_length: 3, sha256: '1'.repeat(64) },
        summary: input.summary,
      }
    })

    const prepared = await utilsModule.prepareRiskForTeamShare(202, () => true)

    expect(order).toEqual(['http', 'serialize-risk', 'prepare-risk'])
    expect(resolveShareableRiskHTTPFlowIdMock).toHaveBeenCalledWith(createRisk())
    expect(prepareHTTPFlowForTeamShareMock).toHaveBeenCalledWith(101, expect.any(Function))
    expect(prepareSharedRiskMock).toHaveBeenCalledWith({
      clientId: 'desktop-client-7',
      localRiskId: '202',
      flowKey: 'a'.repeat(64),
      payload: new Uint8Array([7, 8, 9]),
      summary: {
        title: 'Fresh risk title',
        severity: 'high',
        risk_type: 'sql-injection',
      },
    })
    expect(prepared).toMatchObject({ kind: 'risk', http: { localFlowId: '101' }, risk: { localRiskId: '202' } })
  })

  test('迟到查询或 HTTP 准备结果在失效后不继续构造 Risk', async () => {
    let current = true
    prepareHTTPFlowForTeamShareMock.mockImplementation(async () => {
      current = false
      return createHTTPPrepared()
    })

    await expect(utilsModule.prepareRiskForTeamShare(202, () => current)).resolves.toBeUndefined()
    expect(serializeSharedRiskMock).not.toHaveBeenCalled()
    expect(prepareSharedRiskMock).not.toHaveBeenCalled()
  })

  test.each([
    ['标题', { Title: '' }],
    ['严重级别', { Severity: '' }],
    ['风险类型', { RiskType: '' }],
  ])('缺少%s时失败关闭', async (_, overrides) => {
    ipcInvokeMock.mockResolvedValue({
      Data: [createRisk(overrides)],
      Total: 1,
      Pagination: { Page: 1, Limit: 1 },
    })

    await expect(utilsModule.prepareRiskForTeamShare(202, () => true)).rejects.toThrow()
    expect(prepareHTTPFlowForTeamShareMock).not.toHaveBeenCalled()
    expect(serializeSharedRiskMock).not.toHaveBeenCalled()
  })
})

describe('Risk 表格团队分享 UI 链', () => {
  test('只有可分享的未勾选单行菜单显示入口', async () => {
    const view = renderRiskTable()
    fireEvent.contextMenu(await screen.findByRole('button', { name: '风险行' }))
    expect(showByRightContextMock.mock.calls.at(-1)?.[0].data).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'share-risk' })]),
    )

    fireEvent.click(screen.getByRole('button', { name: '选择风险' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: '风险行' }))
    expect(showByRightContextMock.mock.calls.at(-1)?.[0].data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'share-risk' })]),
    )

    view.unmount()
    useTeamShareAccessMock.mockReturnValue({ available: false, begin: teamShareBeginMock })
    renderRiskTable()
    fireEvent.contextMenu(await screen.findByRole('button', { name: '风险行' }))
    expect(showByRightContextMock.mock.calls.at(-1)?.[0].data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'share-risk' })]),
    )
  })

  test('失效前菜单在 fresh begin 失败后不查询 Risk 或打开 Modal', async () => {
    renderRiskTable()
    fireEvent.contextMenu(await screen.findByRole('button', { name: '风险行' }))
    const staleMenu = showByRightContextMock.mock.calls.at(-1)?.[0]
    teamShareBeginMock.mockResolvedValueOnce(undefined)
    ipcInvokeMock.mockClear()

    await act(async () => {
      staleMenu.onClick({ key: 'share-risk' })
    })

    expect(ipcInvokeMock).not.toHaveBeenCalled()
    expect(shareModalPropsMock).not.toHaveBeenCalled()
  })

  test('真实菜单回调准备 Risk、打开 Modal，并在成功后派发类型化刷新事件', async () => {
    const refreshListener = vi.fn()
    window.addEventListener('yakit:team-shared-records-refresh', refreshListener)
    renderRiskTable()
    fireEvent.contextMenu(await screen.findByRole('button', { name: '风险行' }))
    const menu = showByRightContextMock.mock.calls.at(-1)?.[0]
    ipcInvokeMock.mockClear()

    await act(async () => {
      menu.onClick({ key: 'share-risk' })
    })

    expect(ipcInvokeMock).toHaveBeenCalledWith('QueryRisks', { Ids: [202] })
    expect(await screen.findByRole('button', { name: '完成团队分享' })).toBeInTheDocument()
    expect(shareModalPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        prepared: expect.objectContaining({ kind: 'risk' }),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '完成团队分享' }))
    await waitFor(() => expect(refreshListener).toHaveBeenCalledTimes(1))
    const event = refreshListener.mock.calls[0]?.[0] as CustomEvent<{ teamId: number; projectId: number }>
    expect(event.detail).toEqual({ teamId: 1, projectId: 21 })
    expect(screen.queryByRole('button', { name: '完成团队分享' })).not.toBeInTheDocument()
    window.removeEventListener('yakit:team-shared-records-refresh', refreshListener)
  })
})
