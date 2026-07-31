import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n/i18n'
import {
  publishTeamAuthenticationInvalidation,
  publishTeamPermissionInvalidation,
} from '@/pages/teamCollaboration/teamPermissionContext'
import type { CurrentCollaborationUser } from '@/services/teamCollaboration'
import type { HTTPFlow } from '../HTTPFlowTable.constants'
import type { UseHTTPFlowTableContextMenuOptions } from '../useHTTPFlowTableContextMenu'

var getMeMock = vi.fn()
var getShareTargetCapabilitiesMock = vi.fn()
var readFullHTTPFlowBytesMock = vi.fn()
var getCollaborationClientIDMock = vi.fn()
var prepareSharedHTTPFlowMock = vi.fn()
var ipcInvokeMock = vi.fn()
var showByRightContextMock = vi.fn()

vi.mock('../HTTPFlowTable.module.scss', () => ({ default: {} }))

vi.mock('@/services/teamCollaboration', () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
}))

vi.mock('@/pages/teamCollaboration/ShareToTeamProjectModal', () => ({
  getShareTargetCapabilities: (...args: unknown[]) => getShareTargetCapabilitiesMock(...args),
}))

vi.mock('@/pages/teamCollaboration/sharedRecordAdapters', () => ({
  readFullHTTPFlowBytes: (...args: unknown[]) => readFullHTTPFlowBytesMock(...args),
  getCollaborationClientID: (...args: unknown[]) => getCollaborationClientIDMock(...args),
  prepareSharedHTTPFlow: (...args: unknown[]) => prepareSharedHTTPFlowMock(...args),
}))

vi.mock('@/components/yakitUI/YakitMenu/showByRightContext', () => ({
  showByRightContext: (...args: unknown[]) => showByRightContextMock(...args),
}))

vi.mock('@/utils/clipboard', () => ({
  setClipboardText: vi.fn(),
}))

vi.mock('@/utils/kv', () => ({
  getRemoteValue: vi.fn(),
  setRemoteValue: vi.fn(),
}))

vi.mock('@/utils/envfile', () => ({
  isEnpriTrace: () => false,
}))

vi.mock('@/utils/logCollection', () => ({
  debugToPrintLogs: vi.fn(),
}))

vi.mock('@/hook/useTheme', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn(), syncTheme: vi.fn() }),
}))

vi.mock('@/assets/icon/colors', () => ({
  IconSolidAIIcon: () => null,
  IconSolidAIWhiteIcon: () => null,
}))

vi.mock('@/components/ShowInBrowser', () => ({
  showResponseViaHTTPFlowID: vi.fn(),
}))

vi.mock('@/utils/globalShortcutKey/events/global', () => ({
  GlobalShortcutKey: new Proxy({}, { get: (_, key) => key }),
  getGlobalShortcutKeyEvents: () => new Proxy({}, { get: () => ({ keys: [] }) }),
}))

vi.mock('@/utils/globalShortcutKey/events/multiple/yakitMultiple', () => ({
  YakitMultipleShortcutKey: new Proxy({}, { get: (_, key) => key }),
  getYakitMultipleShortcutKeyEvents: () => new Proxy({}, { get: () => ({ keys: [] }) }),
}))

vi.mock('@/utils/globalShortcutKey/utils', () => ({
  convertKeyboardToUIKey: () => '',
}))

vi.mock('@/utils/notification', () => ({
  yakitNotify: vi.fn(),
}))

vi.mock('@/utils/openWebsite', () => ({
  openExternalWebsite: vi.fn(),
  saveABSFileToOpen: vi.fn(),
}))

vi.mock('@/pages/invoker/fromPacketToYakCode', () => ({
  generateCSRFPocByRequest: vi.fn(),
}))

vi.mock('@/pages/packetScanner/DefaultPacketScanGroup', () => ({
  GetPacketScanByCursorMenuItem: () => undefined,
  packetScanDefaultValue: [],
}))

vi.mock('@/pages/packetScanner/PacketScanner', () => ({
  execPacketScan: vi.fn(),
}))

vi.mock('@/pages/websocket/WebsocketFuzzer', () => ({
  newWebsocketFuzzerTab: vi.fn(),
}))

vi.mock('../HTTPFlowTable.actions', () => ({
  CalloutColor: vi.fn(),
  calloutColorBatch: vi.fn(),
  onBatchExecPacketScan: vi.fn(),
  onRemoveCalloutColor: vi.fn(),
  onRemoveCalloutColorBatch: vi.fn(),
  onSendToTab: vi.fn(),
  toggleHTTPFlowFavorite: vi.fn(),
  toggleHTTPFlowFavoriteBatch: vi.fn(),
}))

vi.mock('@/components/yakitUI/YakitEditor/YakitEditor', () => ({
  PLUGIN_PREFIX: 'plugin:',
}))

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createCurrentUser = (permissions: string[] = ['test_data.write']): CurrentCollaborationUser => ({
  user: {
    id: 7,
    uid: 'user-7',
    name: '测试用户',
    nick_name: '',
    email: '',
    status: 'active',
    legacy_role: '',
    from_platform: '',
  },
  memberships: [
    {
      member: {
        id: 11,
        team_id: 1,
        user_id: 7,
        status: 'active',
        version: 3,
      },
      team: {
        id: 1,
        name: '蓝队',
        slug: 'blue',
        description: '',
        owner_user_id: 7,
        status: 'active',
        version: 1,
      },
      roles: [],
      permissions,
      projects: [
        {
          id: 21,
          team_id: 1,
          project_key: 'project-21',
          name: '蓝队项目',
          description: '',
          status: 'active',
          version: 1,
          created_by: 7,
          updated_by: 7,
        },
      ],
    },
  ],
})

const flow: HTTPFlow = {
  Id: 99,
  FromPlugin: '',
  Method: 'ROW',
  Path: '/preview',
  Hash: 'row-hash',
  IsHTTPS: true,
  Url: 'https://row.invalid/preview',
  URL: 'https://row.invalid/preview',
  Request: new Uint8Array([9, 9]),
  Response: new Uint8Array([8, 8]),
  StatusCode: 599,
  BodyLength: 2,
  ContentType: 'text/plain',
  SourceType: 'mitm',
  RequestHeader: [],
  ResponseHeader: [],
  GetParamsTotal: 0,
  PostParamsTotal: 0,
  CookieParamsTotal: 0,
  CreatedAt: 1,
  UpdatedAt: 1,
  GetParams: [],
  PostParams: [],
  CookieParams: [],
  IsTooLargeResponse: true,
  TooLargeResponseHeaderFile: 'D:\\do-not-read-response-header',
  TooLargeResponseBodyFile: 'D:\\do-not-read-response-body',
  IsTooLargeRequest: true,
  TooLargeRequestHeaderFile: 'D:\\do-not-read-request-header',
  TooLargeRequestBodyFile: 'D:\\do-not-read-request-body',
  DisableRenderStyles: false,
  RequestString: 'preview request',
  ResponseString: 'preview response',
}

type ContextMenuConfig = {
  data: Array<{ key: string; label: React.ReactNode }>
  onClick: (info: { key: string; keyPath: string[] }) => void
}

type HookModule = typeof import('../useHTTPFlowTableContextMenu')
let hookModule: HookModule

const createOptions = (
  overrides: Partial<UseHTTPFlowTableContextMenuOptions> = {},
): UseHTTPFlowTableContextMenuOptions => ({
  t: i18n.getFixedT(null, 'history'),
  i18n,
  userInfo: {
    isLogin: true,
    user_id: 7,
    token: 'token-a',
  },
  data: [flow],
  setData: vi.fn(),
  onlyFavorite: false,
  selected: flow,
  selectedRowKeys: [],
  selectedRows: [],
  isAllSelect: false,
  total: 1,
  downstreamProxyStr: '',
  fromMITM: false,
  setSelected: vi.fn(),
  setSelectedRowKeys: vi.fn(),
  setSelectedRows: vi.fn(),
  setBatchVisible: vi.fn(),
  setCompareLeft: vi.fn(),
  setCompareRight: vi.fn(),
  getUrlWithoutQuery: (url) => url || '',
  getCodecHistoryPlugin: () => [],
  codecMultipleHistoryPluginCom: undefined,
  codecSingleHistoryPluginCom: undefined,
  selectedRowKeysCom: undefined,
  onRemoveHttpHistory: vi.fn(),
  onShareData: vi.fn(),
  onUploadData: vi.fn(),
  onEditTags: vi.fn(),
  onHTTPFlowTableRowDoubleClick: vi.fn(),
  onExcelExport: vi.fn(),
  onHarExport: vi.fn(),
  onPocMould: vi.fn(),
  onBatchPocMould: vi.fn(),
  onShieldRecord: vi.fn(),
  onShieldURL: vi.fn(),
  onShieldDomain: vi.fn(),
  onBatch: vi.fn(),
  onViewAttachmentDataRefresh: vi.fn(),
  ...overrides,
})

const HookHarness: React.FC<{ options: UseHTTPFlowTableContextMenuOptions }> = ({ options }) => {
  const result = hookModule.useHTTPFlowTableContextMenu(options)
  return (
    <>
      <button type="button" onContextMenu={(event) => result.onRowContextMenu(flow, undefined, event)}>
        打开菜单
      </button>
      {result.getRowContextMenu(flow).map((item) => (
        <React.Fragment key={item.key}>{item.label}</React.Fragment>
      ))}
      {result.preparedTeamShare && <span data-testid="prepared-kind">{result.preparedTeamShare.kind}</span>}
    </>
  )
}

beforeAll(async () => {
  Object.defineProperty(window, 'yakitBridge', {
    configurable: true,
    value: new Proxy({}, { get: () => vi.fn() }),
  })
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: { invoke: ipcInvokeMock } }),
  })
  hookModule = await import('../useHTTPFlowTableContextMenu')
})

beforeEach(() => {
  vi.clearAllMocks()
  getMeMock.mockReset().mockResolvedValue({ data: createCurrentUser() })
  getShareTargetCapabilitiesMock.mockImplementation((currentUser: CurrentCollaborationUser) => {
    const permissions = currentUser.memberships[0]?.permissions || []
    const canShareHTTPFlow = permissions.includes('test_data.write')
    return {
      canShareHTTPFlow,
      canShareRisk: canShareHTTPFlow && permissions.includes('test_result.write'),
      teams: canShareHTTPFlow
        ? [
            {
              id: 1,
              canShareHTTPFlow: true,
              canShareRisk: permissions.includes('test_result.write'),
              projects: [{ id: 21 }],
            },
          ]
        : [],
    }
  })
  ipcInvokeMock.mockResolvedValue({
    ...flow,
    Id: 99,
    Method: 'POST',
    Url: 'https://fresh.example/api',
    HostPort: 'fresh.example:443',
    StatusCode: 201,
    CreatedAt: 1_754_000_000,
    Request: new Uint8Array([1]),
    Response: new Uint8Array([2]),
  })
  readFullHTTPFlowBytesMock.mockResolvedValue({
    request: new Uint8Array([1, 2, 3]),
    response: new Uint8Array([4, 5, 6]),
  })
  getCollaborationClientIDMock.mockResolvedValue('desktop-client-7')
  prepareSharedHTTPFlowMock.mockResolvedValue({
    sourceClientId: 'desktop-client-7',
    localFlowId: '99',
    flowKey: 'a'.repeat(64),
    content: '{}',
    contentHash: 'b'.repeat(64),
    name: 'HTTP Flow 99',
    request: { raw_base64: 'AQID', byte_length: 3, sha256: 'c'.repeat(64) },
    response: { raw_base64: 'BAUG', byte_length: 3, sha256: 'd'.repeat(64) },
    summary: {
      method: 'POST',
      url: 'https://fresh.example/api',
      host: 'fresh.example:443',
      status_code: 201,
    },
  })
})

describe('HTTP 历史团队共享菜单', () => {
  test('仅在单行、已登录且新鲜权限存在可写目标时显示稳定入口', async () => {
    const view = render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()

    view.rerender(<HookHarness options={createOptions({ selectedRowKeys: ['99'], selectedRows: [flow] })} />)
    await waitFor(() => expect(screen.queryByTestId('share-http-flow')).not.toBeInTheDocument())

    view.rerender(<HookHarness options={createOptions({ isAllSelect: true })} />)
    expect(screen.queryByTestId('share-http-flow')).not.toBeInTheDocument()

    view.rerender(
      <HookHarness
        options={createOptions({
          userInfo: { isLogin: false, user_id: null, token: '' },
          isAllSelect: false,
        })}
      />,
    )
    await waitFor(() => expect(screen.queryByTestId('share-http-flow')).not.toBeInTheDocument())
  })

  test('缺少精确 test_data.write 权限时不显示入口', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser(['*', 'test_result.write']) })
    render(<HookHarness options={createOptions()} />)

    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('share-http-flow')).not.toBeInTheDocument()
  })

  test('点击只用鲜活 Flow 刷新摘要，并用完整字节和当前 Main client ID 准备分享', async () => {
    render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const menu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig
    await act(async () => {
      menu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] })
    })

    expect(await screen.findByTestId('prepared-kind')).toHaveTextContent('http-flow')
    expect(ipcInvokeMock).toHaveBeenCalledTimes(1)
    expect(ipcInvokeMock).toHaveBeenCalledWith('GetHTTPFlowById', { Id: 99 })
    expect(readFullHTTPFlowBytesMock).toHaveBeenCalledWith(99)
    expect(getCollaborationClientIDMock).toHaveBeenCalledTimes(1)
    expect(prepareSharedHTTPFlowMock).toHaveBeenCalledWith({
      clientId: 'desktop-client-7',
      localFlowId: '99',
      capturedAt: new Date(1_754_000_000 * 1000).toISOString(),
      request: new Uint8Array([1, 2, 3]),
      response: new Uint8Array([4, 5, 6]),
      summary: {
        method: 'POST',
        url: 'https://fresh.example/api',
        host: 'fresh.example:443',
        status_code: 201,
      },
    })
    expect(JSON.stringify(prepareSharedHTTPFlowMock.mock.calls[0]?.[0])).not.toContain('do-not-read')
  })

  test('权限失效后的陈旧菜单引用不发请求且不产生 prepared', async () => {
    getMeMock
      .mockResolvedValueOnce({ data: createCurrentUser() })
      .mockResolvedValueOnce({ data: createCurrentUser(['test_result.write']) })
    render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const staleMenu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig

    act(() => publishTeamPermissionInvalidation(1))
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('share-http-flow')).not.toBeInTheDocument())
    vi.clearAllMocks()

    await act(async () => {
      staleMenu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] })
      await Promise.resolve()
    })

    expect(getMeMock).not.toHaveBeenCalled()
    expect(ipcInvokeMock).not.toHaveBeenCalled()
    expect(readFullHTTPFlowBytesMock).not.toHaveBeenCalled()
    expect(getCollaborationClientIDMock).not.toHaveBeenCalled()
    expect(prepareSharedHTTPFlowMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('prepared-kind')).not.toBeInTheDocument()
  })

  test('权限重新校验恢复入口，但失效前菜单仍保持不可用', async () => {
    const view = render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const staleMenu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig

    act(() => publishTeamPermissionInvalidation(1))
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    vi.clearAllMocks()

    await act(async () => {
      staleMenu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] })
      await Promise.resolve()
    })
    expect(getMeMock).not.toHaveBeenCalled()
    expect(ipcInvokeMock).not.toHaveBeenCalled()

    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const freshMenu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig
    await act(async () => {
      freshMenu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] })
    })
    expect(getMeMock).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  test('组件卸载后遗留菜单不再触发鉴权或本地 Flow 读取', async () => {
    const view = render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const staleMenu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig
    view.unmount()
    vi.clearAllMocks()

    await act(async () => {
      staleMenu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] })
      await Promise.resolve()
    })

    expect(getMeMock).not.toHaveBeenCalled()
    expect(ipcInvokeMock).not.toHaveBeenCalled()
    expect(readFullHTTPFlowBytesMock).not.toHaveBeenCalled()
  })

  test('旧会话点击鉴权的迟到失败不能关闭新会话入口', async () => {
    const oldBeginAuthorization = createDeferred<{ data: CurrentCollaborationUser }>()
    getMeMock
      .mockResolvedValueOnce({ data: createCurrentUser() })
      .mockReturnValueOnce(oldBeginAuthorization.promise)
      .mockResolvedValueOnce({ data: createCurrentUser() })
    const view = render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const oldMenu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig

    act(() => oldMenu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] }))
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2))
    view.rerender(
      <HookHarness
        options={createOptions({
          userInfo: { isLogin: true, user_id: 7, token: 'token-b' },
        })}
      />,
    )
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(3))
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()

    await act(async () => oldBeginAuthorization.reject(new Error('旧点击鉴权失败')))
    expect(screen.getByTestId('share-http-flow')).toBeInTheDocument()
    expect(ipcInvokeMock).not.toHaveBeenCalled()
  })

  test('旧会话点击鉴权的迟到成功不能关闭新会话入口', async () => {
    const oldBeginAuthorization = createDeferred<{ data: CurrentCollaborationUser }>()
    getMeMock
      .mockResolvedValueOnce({ data: createCurrentUser() })
      .mockReturnValueOnce(oldBeginAuthorization.promise)
      .mockResolvedValueOnce({ data: createCurrentUser() })
    const view = render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const oldMenu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig

    act(() => oldMenu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] }))
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2))
    view.rerender(
      <HookHarness
        options={createOptions({
          userInfo: { isLogin: true, user_id: 7, token: 'token-b' },
        })}
      />,
    )
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(3))
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()

    await act(async () =>
      oldBeginAuthorization.resolve({
        data: createCurrentUser(['test_result.write']),
      }),
    )
    expect(screen.getByTestId('share-http-flow')).toBeInTheDocument()
    expect(ipcInvokeMock).not.toHaveBeenCalled()
    expect(readFullHTTPFlowBytesMock).not.toHaveBeenCalled()
  })

  test('同会话并发 begin 的较早成功不能污染较新操作', async () => {
    getMeMock
      .mockResolvedValueOnce({ data: createCurrentUser() })
      .mockResolvedValueOnce({ data: createCurrentUser() })
      .mockResolvedValueOnce({ data: createCurrentUser() })
    render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const menu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig

    getShareTargetCapabilitiesMock.mockImplementationOnce((currentUser: CurrentCollaborationUser) => {
      menu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] })
      return {
        canShareHTTPFlow: false,
        canShareRisk: false,
        teams: [],
      }
    })

    act(() => menu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] }))
    expect(await screen.findByTestId('prepared-kind')).toHaveTextContent('http-flow')
    expect(getMeMock).toHaveBeenCalledTimes(3)
    expect(getShareTargetCapabilitiesMock).toHaveBeenCalledTimes(3)
    expect(ipcInvokeMock).toHaveBeenCalledTimes(1)
    expect(readFullHTTPFlowBytesMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('share-http-flow')).toBeInTheDocument()
  })

  test('旧认证会话的迟到失败不能关闭新会话已恢复的入口', async () => {
    const oldAuthorization = createDeferred<{ data: CurrentCollaborationUser }>()
    getMeMock.mockReturnValueOnce(oldAuthorization.promise).mockResolvedValueOnce({ data: createCurrentUser() })
    const view = render(<HookHarness options={createOptions()} />)
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(1))

    view.rerender(
      <HookHarness
        options={createOptions({
          userInfo: { isLogin: true, user_id: 7, token: 'token-b' },
        })}
      />,
    )
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()

    await act(async () => oldAuthorization.reject(new Error('旧会话已失效')))
    expect(screen.getByTestId('share-http-flow')).toBeInTheDocument()
  })

  test('点击后的新鲜鉴权迟到于认证失效时不再读取本地 Flow', async () => {
    const freshAuthorization = createDeferred<{ data: CurrentCollaborationUser }>()
    getMeMock.mockResolvedValueOnce({ data: createCurrentUser() }).mockReturnValueOnce(freshAuthorization.promise)
    render(<HookHarness options={createOptions()} />)
    expect(await screen.findByTestId('share-http-flow')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '打开菜单' }))
    const menu = showByRightContextMock.mock.calls.at(-1)?.[0] as ContextMenuConfig

    act(() => menu.onClick({ key: 'share-http-flow', keyPath: ['share-http-flow'] }))
    await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(2))
    act(() => publishTeamAuthenticationInvalidation())
    await act(async () => freshAuthorization.resolve({ data: createCurrentUser() }))

    expect(ipcInvokeMock).not.toHaveBeenCalled()
    expect(readFullHTTPFlowBytesMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('prepared-kind')).not.toBeInTheDocument()
  })
})
