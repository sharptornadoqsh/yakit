import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useStore } from '@/store'
import { TeamCollaborationPage } from '../TeamCollaborationPage'
import { publishTeamAuthenticationInvalidation, publishTeamPermissionInvalidation } from '../teamPermissionContext'
import { restoreTeamProjectBundle } from '../teamProjectBundle'
import { prepareSharedHTTPFlow, prepareSharedRisk } from '../sharedRecordAdapters'
import {
  createTeamProject,
  createTestData,
  createTestResult,
  getMe,
  getProjectSync,
  getTestData,
  getTestResult,
  listAuditLogs,
  listProjectMembers,
  listTeamMembers,
  listTeamProjects,
  listTeams,
  listTestData,
  listTestResults,
  updateProjectSnapshot,
} from '@/services/teamCollaboration'

const networkMocks = vi.hoisted(() => ({
  axiosApi: vi.fn(),
  logoutDynamicControl: vi.fn(),
}))

vi.mock('@/services/electronBridge', () => ({
  yakitApp: {
    userSignOut: vi.fn(),
  },
  yakitNetwork: {
    axiosApi: networkMocks.axiosApi,
    logoutDynamicControl: networkMocks.logoutDynamicControl,
  },
  yakitPlugin: {
    deleteByUserId: vi.fn(),
  },
  yakitRelease: {
    setEditionRaw: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/utils/login', () => ({
  loginOutLocal: vi.fn(),
}))

vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({ children, loading, type: _type, ...props }) => (
    <button type="button" {...props} disabled={props.disabled || loading}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/yakitUI/YakitEmpty/YakitEmpty', () => ({
  YakitEmpty: ({ title, description }) => (
    <div>
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}))

vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => {
  const Input = (props) => <input {...props} />
  Input.TextArea = (props) => <textarea {...props} />
  return { YakitInput: Input }
})

vi.mock('@/components/yakitUI/YakitModal/YakitModal', () => ({
  YakitModal: ({ children, footer, title, visible }) =>
    visible ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
        <div>{footer}</div>
      </div>
    ) : null,
}))

vi.mock('@/components/yakitUI/YakitSelect/YakitSelect', () => {
  const Select = ({ allowClear: _allowClear, children, onChange, placeholder, ...props }) => (
    <select {...props} onChange={(event) => onChange?.(event.target.value)}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
  Select.Option = ({ children, ...props }) => <option {...props}>{children}</option>
  return { YakitSelect: Select }
})

vi.mock('@/components/yakitUI/YakitSpin/YakitSpin', () => ({
  YakitSpin: ({ children }) => <div>{children}</div>,
}))

vi.mock('@/components/yakitUI/YakitTag/YakitTag', () => ({
  YakitTag: ({ children }) => <span>{children}</span>,
}))

vi.mock('@/services/teamCollaboration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/teamCollaboration')>()
  return {
    __actualListTeamMembers: actual.listTeamMembers,
    getMe: vi.fn(),
    listTeams: vi.fn(),
    listTeamMembers: vi.fn(),
    listTeamProjects: vi.fn(),
    createTeamProject: vi.fn(),
    listProjectMembers: vi.fn(),
    getProjectSync: vi.fn(),
    updateProjectSnapshot: vi.fn(),
    listTestData: vi.fn(),
    createTestData: vi.fn(),
    getTestData: vi.fn(),
    listTestResults: vi.fn(),
    createTestResult: vi.fn(),
    getTestResult: vi.fn(),
    listAuditLogs: vi.fn(),
  }
})

vi.mock('../teamProjectBundle', async () => {
  const actual = await vi.importActual<typeof import('../teamProjectBundle')>('../teamProjectBundle')
  return { ...actual, restoreTeamProjectBundle: vi.fn() }
})

vi.mock('../SharedHTTPFlowDetail', () => ({
  TEAM_SHARED_RECORDS_REFRESH_EVENT: 'yakit:team-shared-records-refresh',
  SharedHTTPFlowDetail: ({ httpContent, riskContent }) => (
    <div data-testid="shared-http-flow-detail" data-http-content={httpContent} data-risk-content={riskContent || ''} />
  ),
}))

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

const createMembership = ({
  teamId = 1,
  teamName = '蓝队',
  status = 'active',
  version = 1,
  permissions = [],
}: {
  teamId?: number
  teamName?: string
  status?: string
  version?: number
  permissions?: string[]
} = {}) => ({
  member: { id: teamId + 10, team_id: teamId, user_id: 7, status, version },
  team: { id: teamId, name: teamName, status: 'active' },
  roles: [],
  permissions,
  projects: [],
})

const createMeResponse = (memberships: ReturnType<typeof createMembership>[]) =>
  ({
    data: {
      user: { id: 7, name: '小周', status: 'active' },
      memberships,
    },
  }) as never

const createSharedProjectRecords = async () => {
  const http = await prepareSharedHTTPFlow({
    clientId: 'desktop-client-7',
    localFlowId: '101',
    capturedAt: '2026-07-31T00:00:00Z',
    request: new Uint8Array([1, 2, 3]),
    response: new Uint8Array([4, 5, 6]),
    summary: {
      method: 'POST',
      url: 'https://shared.example/api',
      host: 'shared.example:443',
      status_code: 201,
    },
  })
  const risk = await prepareSharedRisk({
    clientId: 'desktop-client-7',
    localRiskId: '202',
    flowKey: http.flowKey,
    payload: new TextEncoder().encode('{"evidence":"strict"}'),
    summary: {
      title: '共享风险',
      severity: 'high',
      risk_type: 'fixture',
    },
  })
  return {
    http,
    risk,
    httpRecord: {
      id: 41,
      team_id: 1,
      project_id: 21,
      name: '共享 HTTP Flow',
      data_type: 'http_flow',
      status: 'active',
      version: 1,
      metadata: '{}',
      deduplication_key: `http-flow:${http.flowKey}`,
      content: http.content,
    },
    riskRecord: {
      id: 51,
      team_id: 1,
      project_id: 21,
      test_data_id: 999,
      name: '共享 Risk',
      result_type: 'risk',
      severity: 'high',
      status: 'active',
      version: 1,
      metadata: '{}',
      deduplication_key: `risk:${risk.riskKey}`,
      content: risk.content,
    },
  }
}

describe('团队协作页面', () => {
  beforeEach(() => {
    publishTeamAuthenticationInvalidation()
    vi.clearAllMocks()
    useStore.setState({
      userInfo: {
        isLogin: true,
        platform: 'company',
        githubName: null,
        githubHeadImg: null,
        wechatName: null,
        wechatHeadImg: null,
        qqName: null,
        qqHeadImg: null,
        companyName: '小周',
        companyHeadImg: null,
        role: null,
        user_id: 7,
        token: 'token-a',
      },
    })
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: undefined,
    })
    vi.mocked(listTeams).mockResolvedValue({
      data: [{ id: 1, name: '蓝队' }],
    } as never)
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: [
              'project.read',
              'project_member.read',
              'member.read',
              'test_data.read',
              'test_result.read',
              'audit.read',
            ],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(listTeamMembers).mockResolvedValue({
      data: [
        {
          id: 11,
          team_id: 1,
          user_id: 7,
          status: 'active',
          user: { id: 7, name: '小周' },
          roles: [{ code: 'tester', name: '测试人员' }],
        },
      ],
    } as never)
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [{ id: 21, name: '供应链评估', version: 4, updated_at: '2026-07-22T08:00:00Z' }],
    } as never)
    vi.mocked(listProjectMembers).mockResolvedValue({
      data: [{ id: 31, team_id: 1, project_id: 21, user_id: 7, access_level: 'read' }],
    } as never)
    vi.mocked(listTestData).mockResolvedValue({
      data: [{ id: 41, name: '登录样本', version: 2, content: 'POST /login' }],
    } as never)
    vi.mocked(listTestResults).mockResolvedValue({
      data: [{ id: 51, name: '基线结果', status: 'passed', content: '{"summary":"通过"}' }],
    } as never)
    vi.mocked(getTestData).mockResolvedValue({
      data: {
        id: 41,
        name: '登录样本',
        data_type: 'http-request',
        metadata: '{"method":"POST"}',
        status: 'active',
        content: 'POST /login\n{"username":"alice"}',
      },
    } as never)
    vi.mocked(getTestResult).mockResolvedValue({
      data: {
        id: 51,
        name: '基线结果',
        result_type: 'verification',
        metadata: '{"duration_ms":120}',
        severity: 'high',
        status: 'passed',
        content: '{"summary":"通过","issues":[]}',
      },
    } as never)
    vi.mocked(listAuditLogs).mockResolvedValue({
      data: [{ id: 61, action: 'snapshot.update', operator_name: '小周', created_at: '2026-07-22T08:10:00Z' }],
    } as never)
    vi.mocked(getProjectSync)
      .mockRejectedValueOnce({ response: { status: 409 }, message: 'version_conflict' })
      .mockResolvedValueOnce({ version: 4, last_sync_at: '2026-07-22T08:30:00Z', changes: [] } as never)
    vi.mocked(restoreTeamProjectBundle).mockResolvedValue({
      manifest: {},
      localProject: { id: 78, name: '供应链评估-本地副本' },
    } as never)
  })

  test('展示团队项目上下文，并允许在冲突后重试同步', async () => {
    render(<TeamCollaborationPage />)

    expect(await screen.findByText('蓝队')).toBeInTheDocument()
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()
    expect(await screen.findByText('检测到 409 版本冲突')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建团队项目' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '更新快照' })).toBeDisabled()
    expect(screen.getAllByText('小周').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('测试人员')).toBeInTheDocument()
    expect(screen.getByText('登录样本')).toBeInTheDocument()
    expect(screen.getByText('POST /login')).toBeInTheDocument()
    expect(screen.getByText('基线结果')).toBeInTheDocument()
    expect(screen.getByText('{"summary":"通过"}')).toBeInTheDocument()
    expect(screen.getByText('snapshot.update')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试同步' }))

    await waitFor(() => expect(getProjectSync).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/最近同步/)).toBeInTheDocument()
  })

  test('同步项目后移除服务端删除记录对应的成员、测试数据和测试结果', async () => {
    vi.mocked(listProjectMembers).mockResolvedValue({
      data: [{ id: 31, team_id: 1, project_id: 21, user_id: 99, user_name: '待移除项目成员' }],
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValueOnce({
        server_time: '2026-07-26T11:00:00Z',
        project: { version: 4, snapshot: {} },
        tombstones: { project_members: [], test_data: [], test_results: [] },
      } as never)
      .mockResolvedValueOnce({
        server_time: '2026-07-26T12:00:00Z',
        project: { version: 4, snapshot: {} },
        tombstones: {
          project_members: [{ id: 31, deleted_at: '2026-07-26T11:57:00Z' }],
          test_data: [{ id: 41, deleted_at: '2026-07-26T11:58:00Z' }],
          test_results: [{ id: 51, deleted_at: '2026-07-26T11:59:00Z' }],
        },
      } as never)

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('待移除项目成员')).toBeInTheDocument()
    expect(screen.getByText('登录样本')).toBeInTheDocument()
    expect(screen.getByText('基线结果')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '同步项目' }))

    await waitFor(() => expect(getProjectSync).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('待移除项目成员')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('登录样本')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('基线结果')).not.toBeInTheDocument())
  })

  test('团队上下文乱序返回时仅展示当前团队项目', async () => {
    vi.mocked(listTeams).mockResolvedValue({
      data: [
        { id: 1, name: '蓝队' },
        { id: 2, name: '红队' },
      ],
    } as never)
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['member.read', 'project.read'],
            projects: [],
          },
          {
            member: { id: 12, team_id: 2, user_id: 7, status: 'active', version: 1 },
            team: { id: 2, name: '红队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['member.read', 'project.read'],
            projects: [],
          },
        ],
      },
    } as never)
    const firstTeamMembers = createDeferred<any>()
    const firstTeamProjects = createDeferred<any>()
    vi.mocked(listTeamMembers).mockImplementation((teamId) =>
      `${teamId}` === '1'
        ? (firstTeamMembers.promise as never)
        : (Promise.resolve({ data: [{ id: 12, user: { id: 7, name: '红队成员' } }] }) as never),
    )
    vi.mocked(listTeamProjects).mockImplementation((teamId) =>
      `${teamId}` === '1'
        ? (firstTeamProjects.promise as never)
        : (Promise.resolve({ data: [{ id: 22, name: '红队项目', version: 2 }] }) as never),
    )
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 2, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(listTeamProjects).toHaveBeenCalledWith('1'))

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } })
    expect(await screen.findByText('红队项目')).toBeInTheDocument()

    await act(async () => {
      firstTeamMembers.resolve({ data: [{ id: 11, user: { id: 7, name: '蓝队迟到成员' } }] })
      firstTeamProjects.resolve({ data: [{ id: 21, name: '蓝队迟到项目', version: 1 }] })
      await Promise.all([firstTeamMembers.promise, firstTeamProjects.promise])
      await Promise.resolve()
    })

    expect(screen.queryByText('蓝队迟到项目')).not.toBeInTheDocument()
    expect(screen.getByText('红队项目')).toBeInTheDocument()
  })

  test('项目上下文乱序返回时仅展示当前项目资料', async () => {
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 2 },
      ],
    } as never)
    const firstMembers = createDeferred<any>()
    const firstData = createDeferred<any>()
    const firstResults = createDeferred<any>()
    const firstAudit = createDeferred<any>()
    vi.mocked(listProjectMembers).mockImplementation((_teamId, projectId) =>
      `${projectId}` === '21'
        ? (firstMembers.promise as never)
        : (Promise.resolve({ data: [{ id: 32, user_name: '第二项目成员' }] }) as never),
    )
    vi.mocked(listTestData).mockImplementation((_teamId, projectId) =>
      `${projectId}` === '21'
        ? (firstData.promise as never)
        : (Promise.resolve({ data: [{ id: 81, name: '第二项目样本', content: 'second payload' }] }) as never),
    )
    vi.mocked(listTestResults).mockImplementation((_teamId, projectId) =>
      `${projectId}` === '21'
        ? (firstResults.promise as never)
        : (Promise.resolve({ data: [{ id: 82, name: '第二项目结果', content: 'second result' }] }) as never),
    )
    vi.mocked(listAuditLogs).mockImplementation((_teamId, params) =>
      `${params?.project_id}` === '21'
        ? (firstAudit.promise as never)
        : (Promise.resolve({ data: [{ id: 83, action: 'second.project.read' }] }) as never),
    )
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 2, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(listTestData).toHaveBeenCalledWith('1', '21'))

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))
    expect(await screen.findByText('第二项目样本')).toBeInTheDocument()
    expect(screen.getByText('第二项目结果')).toBeInTheDocument()

    await act(async () => {
      firstMembers.resolve({ data: [{ id: 31, user_name: '旧项目迟到成员' }] })
      firstData.resolve({ data: [{ id: 41, name: '旧项目迟到资料', content: 'stale payload' }] })
      firstResults.resolve({ data: [{ id: 51, name: '旧项目迟到结果', content: 'stale result' }] })
      firstAudit.resolve({ data: [{ id: 61, action: 'stale.project.read' }] })
      await Promise.all([firstMembers.promise, firstData.promise, firstResults.promise, firstAudit.promise])
      await Promise.resolve()
    })

    expect(screen.queryByText('旧项目迟到资料')).not.toBeInTheDocument()
    expect(screen.queryByText('旧项目迟到结果')).not.toBeInTheDocument()
    expect(screen.getByText('第二项目样本')).toBeInTheDocument()
    expect(getProjectSync).not.toHaveBeenCalledWith('1', '21')
  })

  test('同步请求乱序返回时保留当前项目版本', async () => {
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 2 },
      ],
    } as never)
    const firstSync = createDeferred<any>()
    const secondSync = createDeferred<any>()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockImplementation((_teamId, projectId) => {
        return `${projectId}` === '21' ? (firstSync.promise as never) : (secondSync.promise as never)
      })

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(getProjectSync).toHaveBeenCalledWith('1', '21'))

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))
    await waitFor(() => expect(getProjectSync).toHaveBeenCalledWith('1', '22'))

    await act(async () => {
      secondSync.resolve({
        server_time: '2026-07-23T12:00:00Z',
        project: { version: 22, snapshot: '{}' },
      })
      await secondSync.promise
    })
    expect(await screen.findByText('项目版本 22')).toBeInTheDocument()
    expect(screen.getByText(/最近同步：2026/)).toBeInTheDocument()

    await act(async () => {
      firstSync.resolve({
        server_time: '2026-07-23T11:00:00Z',
        project: { version: 91, snapshot: '{}' },
      })
      await firstSync.promise
      await Promise.resolve()
    })

    expect(screen.getByText('项目版本 22')).toBeInTheDocument()
    expect(screen.queryByText('项目版本 91')).not.toBeInTheDocument()
  })

  test('切换团队等待响应期间清除旧团队成员和项目', async () => {
    vi.mocked(listTeams).mockResolvedValue({
      data: [
        { id: 1, name: '蓝队' },
        { id: 2, name: '红队' },
      ],
    } as never)
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['member.read', 'project.read'],
            projects: [],
          },
          {
            member: { id: 12, team_id: 2, user_id: 7, status: 'active', version: 1 },
            team: { id: 2, name: '红队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['member.read', 'project.read'],
            projects: [],
          },
        ],
      },
    } as never)
    const redMembers = createDeferred<any>()
    const redProjects = createDeferred<any>()
    vi.mocked(listTeamMembers).mockImplementation((teamId) =>
      `${teamId}` === '2'
        ? (redMembers.promise as never)
        : (Promise.resolve({ data: [{ id: 11, user: { id: 7, name: '蓝队旧成员' } }] }) as never),
    )
    vi.mocked(listTeamProjects).mockImplementation((teamId) =>
      `${teamId}` === '2'
        ? (redProjects.promise as never)
        : (Promise.resolve({ data: [{ id: 21, name: '蓝队旧项目', version: 4 }] }) as never),
    )
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('蓝队旧项目')).toBeInTheDocument()
    expect(screen.getAllByText('蓝队旧成员').length).toBeGreaterThan(0)

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } })

    expect(screen.queryByText('蓝队旧项目')).not.toBeInTheDocument()
    expect(screen.queryAllByText('蓝队旧成员')).toHaveLength(0)

    await act(async () => {
      redMembers.resolve({ data: [{ id: 12, user: { id: 7, name: '红队成员' } }] })
      redProjects.resolve({ data: [{ id: 22, name: '红队项目', version: 2 }] })
      await Promise.all([redMembers.promise, redProjects.promise])
    })
    expect(await screen.findByText('红队项目')).toBeInTheDocument()
    expect(screen.getAllByText('红队成员').length).toBeGreaterThan(0)
  })

  test('切换项目等待响应期间清除旧项目资料', async () => {
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 2 },
      ],
    } as never)
    const secondMembers = createDeferred<any>()
    const secondData = createDeferred<any>()
    const secondResults = createDeferred<any>()
    const secondAudit = createDeferred<any>()
    vi.mocked(listProjectMembers).mockImplementation((_teamId, projectId) =>
      `${projectId}` === '22'
        ? (secondMembers.promise as never)
        : (Promise.resolve({ data: [{ id: 31, user_name: '旧项目成员' }] }) as never),
    )
    vi.mocked(listTestData).mockImplementation((_teamId, projectId) =>
      `${projectId}` === '22'
        ? (secondData.promise as never)
        : (Promise.resolve({ data: [{ id: 41, name: '旧项目样本', content: 'old payload' }] }) as never),
    )
    vi.mocked(listTestResults).mockImplementation((_teamId, projectId) =>
      `${projectId}` === '22'
        ? (secondResults.promise as never)
        : (Promise.resolve({ data: [{ id: 51, name: '旧项目结果', content: 'old result' }] }) as never),
    )
    vi.mocked(listAuditLogs).mockImplementation((_teamId, params) =>
      `${params?.project_id}` === '22'
        ? (secondAudit.promise as never)
        : (Promise.resolve({ data: [{ id: 61, action: 'old.project.read' }] }) as never),
    )
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('旧项目样本')).toBeInTheDocument()
    expect(screen.getByText('旧项目结果')).toBeInTheDocument()
    expect(screen.getByText('old.project.read')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))

    expect(screen.queryByText('旧项目样本')).not.toBeInTheDocument()
    expect(screen.queryByText('旧项目结果')).not.toBeInTheDocument()
    expect(screen.queryByText('old.project.read')).not.toBeInTheDocument()

    await act(async () => {
      secondMembers.resolve({ data: [{ id: 32, user_name: '第二项目成员' }] })
      secondData.resolve({ data: [{ id: 81, name: '第二项目样本', content: 'second payload' }] })
      secondResults.resolve({ data: [{ id: 82, name: '第二项目结果', content: 'second result' }] })
      secondAudit.resolve({ data: [{ id: 83, action: 'second.project.read' }] })
      await Promise.all([secondMembers.promise, secondData.promise, secondResults.promise, secondAudit.promise])
    })
    expect(await screen.findByText('第二项目样本')).toBeInTheDocument()
    expect(screen.getByText('第二项目结果')).toBeInTheDocument()
  })

  test('切换项目时重置快照并忽略旧项目更新错误', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'maintainer', name: '维护人员' }],
            permissions: ['project.read', 'project.manage'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 2 },
      ],
    } as never)
    const secondSync = createDeferred<any>()
    const oldUpdate = createDeferred<any>()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockImplementation((_teamId, projectId) =>
        `${projectId}` === '22'
          ? (secondSync.promise as never)
          : (Promise.resolve({
              server_time: '2026-07-23T12:00:00Z',
              project: { version: 4, snapshot: '{"source":"project-a"}' },
            }) as never),
      )
    vi.mocked(updateProjectSnapshot).mockReturnValue(oldUpdate.promise as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByDisplayValue(/"source": "project-a"/)).toHaveValue(
      JSON.stringify({ source: 'project-a' }, null, 2),
    )
    expect(screen.getByRole('button', { name: '更新快照' })).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText('项目快照'), { target: { value: '{"draft":"project-a"}' } })
    fireEvent.click(screen.getByRole('button', { name: '更新快照' }))
    await waitFor(() => expect(updateProjectSnapshot).toHaveBeenCalledTimes(1))
    expect(updateProjectSnapshot).toHaveBeenCalledWith('1', '21', {
      snapshot: { draft: 'project-a' },
      version: 4,
    })

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))

    expect(screen.getByLabelText('项目快照')).toHaveValue('{}')
    expect(screen.getByRole('button', { name: '更新快照' })).toBeDisabled()

    await act(async () => {
      secondSync.resolve({
        server_time: '2026-07-23T12:05:00Z',
        project: { version: 2, snapshot: '{"source":"project-b"}' },
      })
      await secondSync.promise
    })
    expect(screen.getByLabelText('项目快照')).toHaveValue(JSON.stringify({ source: 'project-b' }, null, 2))
    expect(screen.getByRole('button', { name: '更新快照' })).not.toBeDisabled()

    await act(async () => {
      oldUpdate.reject({ response: { status: 409 }, message: 'version_conflict' })
      await oldUpdate.promise.catch(() => undefined)
    })
    expect(screen.queryByText('检测到 409 版本冲突')).not.toBeInTheDocument()
  })

  test('项目往返切换后展示原项目迟到的创建结果', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 2 },
      ],
    } as never)
    const saveRequest = createDeferred<any>()
    const refreshRequest = createDeferred<any>()
    vi.mocked(createTestData).mockReturnValue(saveRequest.promise as never)
    vi.mocked(listTestData).mockImplementation((_teamId, projectId) => {
      if (`${projectId}` === '22') {
        return Promise.resolve({ data: [{ id: 81, name: '第二项目样本', content: 'second payload' }] }) as never
      }
      if (vi.mocked(createTestData).mock.calls.length > 0) return refreshRequest.promise as never
      return Promise.resolve({ data: [{ id: 41, name: '登录样本', content: 'POST /login' }] }) as never
    })
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('登录样本')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '往返创建样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'round trip payload' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))
    expect(await screen.findByText('第二项目样本')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /供应链评估/ }))
    expect(await screen.findByText(/项目详情 · 供应链评估/)).toBeInTheDocument()

    await act(async () => {
      saveRequest.resolve({ data: { id: 71, name: '往返创建样本', content: 'round trip payload' } })
      await saveRequest.promise
    })
    expect(screen.getByText('往返创建样本')).toBeInTheDocument()

    await act(async () => {
      refreshRequest.resolve({ data: [{ id: 71, name: '往返创建样本', content: 'round trip payload' }] })
      await refreshRequest.promise
    })
  })

  test('提交用户编辑的测试数据和测试结果正文及元数据', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'maintainer', name: '维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write', 'test_result.read', 'test_result.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(createTestData).mockResolvedValue({ data: { id: 71 } } as never)
    vi.mocked(createTestResult).mockResolvedValue({ data: { id: 72 } } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '请求样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    expect(await screen.findByRole('dialog', { name: '新增共享测试数据' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('测试数据类型'), { target: { value: 'http-request' } })
    fireEvent.change(screen.getByLabelText('测试数据元数据'), { target: { value: '{"method":"POST"}' } })
    fireEvent.change(screen.getByLabelText('测试数据正文'), {
      target: { value: 'POST /login\n{"username":"alice"}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(1))
    expect(createTestData).toHaveBeenCalledWith(
      '1',
      '21',
      expect.objectContaining({
        name: '请求样本',
        type: 'http-request',
        status: 'active',
        metadata: { method: 'POST' },
        content: 'POST /login\n{"username":"alice"}',
      }),
    )

    fireEvent.change(screen.getByPlaceholderText('测试结果名称'), { target: { value: '验证结果' } })
    fireEvent.click(screen.getByRole('button', { name: '新增结果' }))
    expect(await screen.findByRole('dialog', { name: '新增共享测试结果' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('测试结果类型'), { target: { value: 'verification' } })
    fireEvent.change(screen.getByLabelText('测试结果状态'), { target: { value: 'failed' } })
    fireEvent.change(screen.getByLabelText('测试结果严重级别'), { target: { value: 'high' } })
    expect(await screen.findByRole('option', { name: '登录样本' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('关联测试数据'), { target: { value: '41' } })
    fireEvent.change(screen.getByLabelText('测试结果元数据'), { target: { value: '{"duration_ms":120}' } })
    fireEvent.change(screen.getByLabelText('测试结果正文'), {
      target: { value: '{"summary":"发现越权","issues":["IDOR"]}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存测试结果' }))
    await waitFor(() => expect(createTestResult).toHaveBeenCalledTimes(1))
    expect(createTestResult).toHaveBeenCalledWith(
      '1',
      '21',
      expect.objectContaining({
        name: '验证结果',
        type: 'verification',
        test_data_id: 41,
        severity: 'high',
        status: 'failed',
        metadata: { duration_ms: 120 },
        content: '{"summary":"发现越权","issues":["IDOR"]}',
      }),
    )
  })

  test('创建成功但列表刷新失败时关闭编辑窗口且不允许重复提交', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(createTestData).mockResolvedValue({
      data: { id: 71, name: '刷新异常样本', version: 1, content: 'created payload' },
    } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('登录样本')).toBeInTheDocument()
    vi.mocked(listTestData).mockRejectedValueOnce(new Error('列表刷新失败'))

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '刷新异常样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'created payload' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))

    expect(await screen.findByText('列表刷新失败')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '新增共享测试数据' })).not.toBeInTheDocument()
    expect(screen.getByText('created payload')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('测试数据名称')).toHaveValue('')
    expect(screen.getByRole('button', { name: '新增数据' })).toBeDisabled()
    expect(createTestData).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '恢复刷新样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'recovered payload' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))

    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('列表刷新失败')).not.toBeInTheDocument())
  })

  test('切换项目后忽略旧项目创建产生的迟到刷新结果', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 1 },
      ],
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    const staleRefresh = createDeferred<any>()
    vi.mocked(listTestData).mockImplementation((_teamId, projectId) => {
      if (`${projectId}` === '22') {
        return Promise.resolve({ data: [{ id: 81, name: '第二项目样本', content: 'second project payload' }] }) as never
      }
      if (vi.mocked(createTestData).mock.calls.length > 0) return staleRefresh.promise as never
      return Promise.resolve({ data: [{ id: 41, name: '登录样本', content: 'POST /login' }] }) as never
    })
    vi.mocked(createTestData).mockResolvedValue({
      data: { id: 71, name: '已创建样本', version: 1, content: 'created payload' },
    } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('登录样本')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '已创建样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'created payload' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))
    await waitFor(() => expect(listTestData).toHaveBeenNthCalledWith(2, '1', '21'))

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))
    expect(await screen.findByText('第二项目样本')).toBeInTheDocument()

    await act(async () => {
      staleRefresh.resolve({ data: [{ id: 91, name: '旧项目迟到样本', content: 'stale payload' }] })
      await staleRefresh.promise
    })

    await waitFor(() => expect(screen.queryByText('旧项目迟到样本')).not.toBeInTheDocument())
    expect(screen.getByText('第二项目样本')).toBeInTheDocument()
  })

  test('项目同步期间保持记录保存状态并阻止重复提交', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write'],
            projects: [],
          },
        ],
      },
    } as never)
    const saveRequest = createDeferred<any>()
    const syncRequest = createDeferred<any>()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValueOnce({ version: 4, snapshot: {} } as never)
      .mockReturnValueOnce(syncRequest.promise as never)
    vi.mocked(createTestData).mockReturnValue(saveRequest.promise as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('登录样本')).toBeInTheDocument()
    await waitFor(() => expect(getProjectSync).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '并发样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'concurrent payload' } })
    const saveButton = screen.getByRole('button', { name: '保存测试数据' })
    fireEvent.click(saveButton)
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(1))
    expect(saveButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '同步项目' }))
    await waitFor(() => expect(getProjectSync).toHaveBeenCalledTimes(2))
    expect(saveButton).toBeDisabled()

    await act(async () => {
      syncRequest.resolve({ version: 4, snapshot: {} })
      await syncRequest.promise
    })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(createTestData).toHaveBeenCalledTimes(1)

    await act(async () => {
      saveRequest.resolve({ data: { id: 71, name: '并发样本', content: 'concurrent payload' } })
      await saveRequest.promise
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增共享测试数据' })).not.toBeInTheDocument())
  })

  test('记录创建未完成时跨项目切换仍禁止新的记录提交', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [
        { id: 21, name: '供应链评估', version: 4 },
        { id: 22, name: '第二项目', version: 2 },
      ],
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    const saveRequest = createDeferred<any>()
    vi.mocked(createTestData).mockReturnValue(saveRequest.promise as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('登录样本')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '未完成样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'pending payload' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /第二项目/ }))
    expect(await screen.findByText(/项目详情 · 第二项目/)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '第二项目新样本' } })
    expect(screen.getByRole('button', { name: '新增数据' })).toBeDisabled()

    await act(async () => {
      saveRequest.resolve({ data: { id: 71, name: '未完成样本', content: 'pending payload' } })
      await saveRequest.promise
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '新增数据' })).not.toBeDisabled())
    expect(createTestData).toHaveBeenCalledTimes(1)
  })

  test('认证切换作废旧记录保存并允许新会话独立保存', async () => {
    vi.mocked(getMe).mockResolvedValue(
      createMeResponse([
        createMembership({
          version: 1,
          permissions: ['project.read', 'test_data.read', 'test_data.write'],
        }),
      ]),
    )
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    const previousSessionSave = createDeferred<any>()
    const currentSessionSave = createDeferred<any>()
    vi.mocked(createTestData)
      .mockReturnValueOnce(previousSessionSave.promise as never)
      .mockReturnValueOnce(currentSessionSave.promise as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('登录样本')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '旧会话样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'previous session' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(1))

    act(() => {
      useStore.setState((state) => ({
        userInfo: { ...state.userInfo, token: 'token-b' },
      }))
    })
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByPlaceholderText('测试数据名称')).not.toBeDisabled())

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '新会话样本' } })
    expect(screen.getByRole('button', { name: '新增数据' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))
    fireEvent.change(await screen.findByLabelText('测试数据正文'), { target: { value: 'current session' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(2))

    await act(async () => {
      previousSessionSave.resolve({ data: { id: 71, name: '旧会话样本', content: 'previous session' } })
      await previousSessionSave.promise
    })
    expect(screen.getByRole('dialog', { name: '新增共享测试数据' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存测试数据' })).toBeDisabled()

    await act(async () => {
      currentSessionSave.resolve({ data: { id: 72, name: '新会话样本', content: 'current session' } })
      await currentSessionSave.promise
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增共享测试数据' })).not.toBeInTheDocument())
  })

  test('创建接口失败时保留测试结果编辑内容且省略空关联字段', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'result_writer', name: '结果维护人员' }],
            permissions: ['project.read', 'test_result.read', 'test_result.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(createTestResult).mockRejectedValue(new Error('结果保存失败'))

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('测试结果名称'), { target: { value: '失败结果' } })
    fireEvent.click(screen.getByRole('button', { name: '新增结果' }))
    fireEvent.change(await screen.findByLabelText('测试结果正文'), { target: { value: 'result payload' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试结果' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('结果保存失败')
    expect(screen.getByRole('dialog', { name: '新增共享测试结果' })).toBeInTheDocument()
    expect(screen.getByLabelText('测试结果正文')).toHaveValue('result payload')
    expect(createTestResult).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createTestResult).mock.calls[0][2]).not.toHaveProperty('test_data_id')
  })

  test('读取并展示测试数据详情正文', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '登录样本' }))

    await waitFor(() => expect(getTestData).toHaveBeenCalledWith('1', '21', '41'))
    expect(await screen.findByRole('dialog', { name: '测试数据详情' })).toBeInTheDocument()
    expect(screen.getByLabelText('测试数据正文详情')).toHaveValue('POST /login\n{"username":"alice"}')
    expect(screen.getByLabelText('测试数据元数据详情')).toHaveValue('{"method":"POST"}')
  })

  test('文件型记录在列表中提示正文需要从详情读取', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({
      data: [{ id: 41, name: '文件型样本', content: '', file_size: 128, content_hash: 'data-sha256' }],
    } as never)
    vi.mocked(listTestResults).mockResolvedValue({
      data: [
        { id: 51, name: '文件型结果', content: '', file_size: 256, content_hash: 'result-sha256' },
        { id: 52, name: '摘要结果', content: '', summary: '结果摘要' },
      ],
    } as never)

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('文件型样本')).toBeInTheDocument()
    expect(screen.getByText('文件型结果')).toBeInTheDocument()
    expect(screen.getByText('结果摘要')).toBeInTheDocument()
    expect(screen.getAllByText('正文已存储，请在详情中查看')).toHaveLength(2)
    expect(screen.queryByText('暂无正文')).not.toBeInTheDocument()
  })

  test('详情请求乱序返回时仅展示最后选择的记录', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({
      data: [
        { id: 41, name: '登录样本', version: 2 },
        { id: 42, name: '第二样本', version: 1 },
      ],
    } as never)
    const firstRequest = createDeferred<any>()
    const secondRequest = createDeferred<any>()
    vi.mocked(getTestData)
      .mockReturnValueOnce(firstRequest.promise as never)
      .mockReturnValueOnce(secondRequest.promise as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('第二样本')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '登录样本' }))
    fireEvent.click(screen.getByRole('button', { name: '第二样本' }))

    await act(async () => {
      secondRequest.resolve({
        data: {
          id: 42,
          name: '第二样本',
          data_type: 'raw',
          metadata: '{}',
          status: 'active',
          content: 'second payload',
        },
      })
      await secondRequest.promise
    })
    expect(await screen.findByDisplayValue('second payload')).toBeInTheDocument()

    await act(async () => {
      firstRequest.resolve({
        data: {
          id: 41,
          name: '登录样本',
          data_type: 'http-request',
          metadata: '{}',
          status: 'active',
          content: 'first payload',
        },
      })
      await firstRequest.promise
    })

    expect(screen.getByLabelText('测试数据正文详情')).toHaveValue('second payload')
    expect(screen.queryByDisplayValue('first payload')).not.toBeInTheDocument()
  })

  test('读取并展示测试结果详情正文', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '基线结果' }))

    await waitFor(() => expect(getTestResult).toHaveBeenCalledWith('1', '21', '51'))
    expect(await screen.findByRole('dialog', { name: '测试结果详情' })).toBeInTheDocument()
    expect(screen.getByLabelText('测试结果正文详情')).toHaveValue('{"summary":"通过","issues":[]}')
    expect(screen.getByLabelText('测试结果元数据详情')).toHaveValue('{"duration_ms":120}')
  })

  test('测试结果详情正文为空时展示空值状态', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(getTestResult).mockResolvedValue({
      data: {
        id: 51,
        name: '基线结果',
        result_type: 'verification',
        metadata: '{}',
        severity: 'info',
        status: 'passed',
        content: '',
      },
    } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '基线结果' }))

    await waitFor(() => expect(getTestResult).toHaveBeenCalledWith('1', '21', '51'))
    expect(await screen.findByRole('dialog', { name: '测试结果详情' })).toBeInTheDocument()
    expect(screen.getByText('暂无正文')).toBeInTheDocument()
  })

  test('详情读取失败时在详情窗口展示错误', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(getTestData).mockRejectedValue(new Error('正文读取失败'))

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '登录样本' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('正文读取失败')
    expect(getTestData).toHaveBeenCalledWith('1', '21', '41')
  })

  test('正文为空时禁止保存并拒绝非对象元数据', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'maintainer', name: '维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('测试数据名称'), { target: { value: '边界样本' } })
    fireEvent.click(screen.getByRole('button', { name: '新增数据' }))

    expect(await screen.findByRole('button', { name: '保存测试数据' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('测试数据正文'), { target: { value: 'payload' } })
    fireEvent.change(screen.getByLabelText('测试数据元数据'), { target: { value: '[]' } })
    fireEvent.click(screen.getByRole('button', { name: '保存测试数据' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('测试数据元数据必须是 JSON 对象')
    expect(createTestData).not.toHaveBeenCalled()
  })

  test('按服务端细粒度权限分别控制写入入口', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['project.read', 'test_data.read', 'test_data.write', 'test_result.read'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled()
    expect(screen.getByRole('button', { name: '创建团队项目' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '更新快照' })).toBeDisabled()
    expect(screen.getByPlaceholderText('测试数据名称')).not.toBeDisabled()
    expect(screen.getByPlaceholderText('测试结果名称')).toBeDisabled()
  })

  test('管理员角色、can_write 和通配符均不能替代精确权限码', async () => {
    vi.mocked(listTeams).mockResolvedValue({
      data: [{ id: 1, name: '蓝队', can_write: true }],
    } as never)
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 5 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'administrator', name: '管理员' }],
            permissions: ['*', 'project.read'],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('输入项目名称'), { target: { value: '不应创建' } })
    expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled()
    expect(screen.getByRole('button', { name: '创建团队项目' })).toBeDisabled()
    expect(screen.getByPlaceholderText('测试数据名称')).toBeDisabled()
    expect(screen.getByPlaceholderText('测试结果名称')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '创建团队项目' }))
    expect(createTeamProject).not.toHaveBeenCalled()
  })

  test('成员版本缺失时仍请求 /me 但不建立权限快照', async () => {
    const membership = createMembership({ permissions: ['project.manage'] })
    delete (membership.member as { version?: number }).version
    vi.mocked(getMe).mockResolvedValue(createMeResponse([membership]))
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('暂无团队项目')).toBeInTheDocument()
    expect(getMe).toHaveBeenCalledTimes(1)
    expect(listTeamMembers).not.toHaveBeenCalled()
    expect(listTeamProjects).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled()
    expect(screen.getByRole('button', { name: '创建团队项目' })).toBeDisabled()
  })

  test('停用成员不选择团队，也不读取团队上下文', async () => {
    vi.mocked(getMe).mockResolvedValue(
      createMeResponse([createMembership({ status: 'disabled', permissions: ['project.manage'] })]),
    )

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('暂无团队')).toBeInTheDocument()
    expect(listTeamMembers).not.toHaveBeenCalled()
    expect(listTeamProjects).not.toHaveBeenCalled()
  })

  test.each([401, 403])('/me 返回 %i 时清空团队权限和上下文', async (status) => {
    vi.mocked(getMe).mockRejectedValue({ response: { status }, message: '认证失效' })

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('暂无团队')).toBeInTheDocument()
    expect(listTeamMembers).not.toHaveBeenCalled()
    expect(listTeamProjects).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('输入项目名称')).not.toBeInTheDocument()
  })

  test('bootstrap 无活动 membership 时保持空快照和空团队', async () => {
    vi.mocked(getMe).mockResolvedValue(createMeResponse([]))

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('暂无团队')).toBeInTheDocument()
    expect(getMe).toHaveBeenCalledTimes(1)
    expect(listTeamMembers).not.toHaveBeenCalled()
    expect(listTeamProjects).not.toHaveBeenCalled()
  })

  test('当前团队失效立即清空写权限，且版本水位拒绝迟到的较低版本', async () => {
    const staleResponse = createDeferred<never>()
    vi.mocked(getMe)
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 5, permissions: ['project.manage'] })]))
      .mockReturnValueOnce(staleResponse.promise)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())

    act(() => publishTeamPermissionInvalidation(1))
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('输入项目名称'), { target: { value: '禁止创建' } })
    fireEvent.click(screen.getByRole('button', { name: '创建团队项目' }))
    expect(createTeamProject).not.toHaveBeenCalled()

    await act(async () => {
      staleResponse.resolve(
        createMeResponse([createMembership({ version: 4, permissions: ['project.manage'] })]) as never,
      )
    })
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled())
  })

  test('/me 403 只清权限快照，后续低于会话水位的版本仍失败关闭', async () => {
    vi.mocked(getMe)
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 5, permissions: ['project.manage'] })]))
      .mockRejectedValueOnce({ response: { status: 403 }, message: '团队访问已失效' })
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 4, permissions: ['project.manage'] })]))

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    expect(screen.queryByPlaceholderText('输入项目名称')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled())
  })

  test('同一用户和 Authorization 卸载重挂后仍拒绝低于最高水位的版本', async () => {
    vi.mocked(getMe)
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 5, permissions: ['project.manage'] })]))
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 4, permissions: ['project.manage'] })]))

    const view = render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())
    view.unmount()

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).toBeDisabled())
  })

  test('认证令牌改变后的首次提交阶段即拒绝旧快照和旧处理函数', async () => {
    const nextAuthenticationResponse = createDeferred<never>()
    let disabledBeforePassiveEffects: boolean | undefined
    vi.mocked(getMe)
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 5, permissions: ['project.manage'] })]))
      .mockReturnValueOnce(nextAuthenticationResponse.promise)

    const AuthenticationSwitchHarness = () => {
      const [switched, setSwitched] = React.useState(false)
      React.useLayoutEffect(() => {
        if (!switched) return
        const createButton = screen.getByRole('button', { name: '创建团队项目' }) as HTMLButtonElement
        disabledBeforePassiveEffects = createButton.disabled
        createButton.click()
      }, [switched])
      return (
        <>
          <button
            type="button"
            onClick={() => {
              useStore.setState((state) => ({
                userInfo: { ...state.userInfo, token: 'token-b' },
              }))
              setSwitched(true)
            }}
          >
            切换认证
          </button>
          <TeamCollaborationPage />
        </>
      )
    }

    render(<AuthenticationSwitchHarness />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())
    fireEvent.change(screen.getByPlaceholderText('输入项目名称'), { target: { value: '不应创建' } })

    fireEvent.click(screen.getByRole('button', { name: '切换认证' }))

    expect(disabledBeforePassiveEffects).toBe(true)
    expect(createTeamProject).not.toHaveBeenCalled()
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
  })

  test('非 /me 的第二版接口 401 经真实 fetch 和 service 链路立即使页面权限失效', async () => {
    vi.mocked(getMe).mockResolvedValue(
      createMeResponse([createMembership({ version: 5, permissions: ['project.manage'] })]),
    )
    networkMocks.axiosApi.mockResolvedValueOnce({
      code: 401,
      message: 'token过期',
      data: { ok: false, error: { code: 'unauthorized', message: 'token过期' } },
    })
    const actualService =
      (await import('@/services/teamCollaboration')) as typeof import('@/services/teamCollaboration') & {
        __actualListTeamMembers: typeof listTeamMembers
      }

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())

    const requestResult = actualService.__actualListTeamMembers(1).then(
      (value) => ({ rejected: false as const, value }),
      (error) => ({ rejected: true as const, error }),
    )
    await waitFor(() => expect(networkMocks.axiosApi).toHaveBeenCalledTimes(1))
    await expect(requestResult).resolves.toMatchObject({
      rejected: true,
      error: { status: 401, response: { status: 401 } },
    })

    expect(screen.queryByPlaceholderText('输入项目名称')).not.toBeInTheDocument()
    expect(screen.getByTestId('team-selector')).toBeDisabled()
    expect(screen.getByText('只读')).toBeInTheDocument()
  })

  test('A 团队权限请求迟到时不能覆盖已切换到 B 的权限快照', async () => {
    const lateAResponse = createDeferred<never>()
    vi.mocked(listTeams).mockResolvedValue({
      data: [
        { id: 1, name: '蓝队' },
        { id: 2, name: '红队' },
      ],
    } as never)
    const initialMemberships = [
      createMembership({ teamId: 1, teamName: '蓝队', version: 5, permissions: ['project.manage'] }),
      createMembership({ teamId: 2, teamName: '红队', version: 3, permissions: ['project.manage'] }),
    ]
    vi.mocked(getMe)
      .mockResolvedValueOnce(createMeResponse(initialMemberships))
      .mockReturnValueOnce(lateAResponse.promise)
      .mockResolvedValueOnce(createMeResponse(initialMemberships))
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByTestId('team-selector'), { target: { value: '2' } })
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())
    expect(screen.getByTestId('team-selector')).toHaveValue('2')

    await act(async () => {
      lateAResponse.resolve(
        createMeResponse([
          createMembership({ teamId: 1, teamName: '蓝队', version: 6, permissions: [] }),
          createMembership({ teamId: 2, teamName: '红队', version: 3, permissions: ['project.manage'] }),
        ]) as never,
      )
    })

    expect(screen.getByTestId('team-selector')).toHaveValue('2')
    expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled()
  })

  test('迟到的 A 团队失效只清 A，不刷新当前 B 团队', async () => {
    vi.mocked(listTeams).mockResolvedValue({
      data: [
        { id: 1, name: '蓝队' },
        { id: 2, name: '红队' },
      ],
    } as never)
    const memberships = [
      createMembership({ teamId: 1, teamName: '蓝队', version: 5, permissions: ['project.manage'] }),
      createMembership({ teamId: 2, teamName: '红队', version: 3, permissions: ['project.manage'] }),
    ]
    vi.mocked(getMe).mockResolvedValue(createMeResponse(memberships))
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())

    fireEvent.change(screen.getByTestId('team-selector'), { target: { value: '2' } })
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('team-selector')).toHaveValue('2')
    expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled()

    act(() => publishTeamPermissionInvalidation(1))
    await act(async () => Promise.resolve())

    expect(getMe).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('team-selector')).toHaveValue('2')
    expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled()
  })

  test('Authorization 改变开启新会话并允许接受较低的正整数版本', async () => {
    vi.mocked(getMe)
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 5, permissions: ['project.manage'] })]))
      .mockResolvedValueOnce(createMeResponse([createMembership({ version: 1, permissions: ['project.manage'] })]))
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled())

    act(() => {
      useStore.setState((state) => ({
        userInfo: { ...state.userInfo, token: 'token-b' },
      }))
    })

    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
    expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled()
  })

  test('没有审计权限时不请求审计接口', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 1 },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: [
              'project.read',
              'project_member.read',
              'member.read',
              'test_data.read',
              'test_data.write',
              'test_result.read',
              'test_result.write',
            ],
            projects: [],
          },
        ],
      },
    } as never)
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByText('供应链评估')).toBeInTheDocument()
    await waitFor(() => expect(listTestResults).toHaveBeenCalledTimes(1))

    expect(listAuditLogs).not.toHaveBeenCalled()
    expect(screen.queryByText('snapshot.update')).not.toBeInTheDocument()
  })

  test('同名项目默认创建副本，也可在生成备份后覆盖本地项目', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({
        server_time: '2026-07-23T12:00:00Z',
        project: { version: 4, snapshot: '{}' },
      } as never)
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({
        ipcRenderer: {
          invoke: vi.fn(async (channel) =>
            channel === 'GetProjects'
              ? { Projects: [{ Id: 77, ProjectName: '供应链评估', Type: 'project' }] }
              : undefined,
          ),
        },
      })),
    })

    render(<TeamCollaborationPage />)
    expect((await screen.findAllByText('供应链评估')).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByPlaceholderText('本地副本名称'), { target: { value: '供应链评估' } })
    fireEvent.click(screen.getByRole('button', { name: '下载为本地副本' }))

    expect(await screen.findByRole('dialog', { name: '本地存在同名项目' })).toBeInTheDocument()
    expect(restoreTeamProjectBundle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '本地存在同名项目' })).not.toBeInTheDocument()
    expect(restoreTeamProjectBundle).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '下载为本地副本' }))
    fireEvent.click(screen.getByRole('button', { name: '创建副本' }))

    await waitFor(() => expect(restoreTeamProjectBundle).toHaveBeenCalledTimes(1))
    expect(restoreTeamProjectBundle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        localProjectName: '供应链评估-本地副本',
        overwriteLocalProject: undefined,
        onlineProjectVersion: 4,
      }),
      expect.any(Object),
    )

    fireEvent.change(screen.getByPlaceholderText('本地副本名称'), { target: { value: '供应链评估' } })
    fireEvent.click(screen.getByRole('button', { name: '下载为本地副本' }))
    fireEvent.click(await screen.findByRole('button', { name: '覆盖本地副本' }))

    await waitFor(() => expect(restoreTeamProjectBundle).toHaveBeenCalledTimes(2))
    expect(restoreTeamProjectBundle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        localProjectName: '供应链评估',
        overwriteLocalProject: { id: 77, name: '供应链评估', type: 'project' },
        onlineProjectVersion: 4,
      }),
      expect.any(Object),
    )
  })

  test('共享 HTTP Flow 仅在严格解析与 dedup 匹配后提供稳定行标识和远端只读详情', async () => {
    const records = await createSharedProjectRecords()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [records.httpRecord] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [] } as never)
    vi.mocked(getTestData).mockResolvedValue({ data: records.httpRecord } as never)

    render(<TeamCollaborationPage />)

    expect(await screen.findByTestId(`team-test-data-row-${records.http.flowKey}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '共享 HTTP Flow' }))

    await waitFor(() => expect(getTestData).toHaveBeenCalledWith('1', '21', '41'))
    expect(await screen.findByTestId('shared-http-flow-detail')).toHaveAttribute(
      'data-http-content',
      records.http.content,
    )
    expect(screen.getByTestId('shared-http-flow-detail')).toHaveAttribute('data-risk-content', '')
  })

  test('共享 HTTP Flow 的列表或 fresh 响应身份不匹配时失败关闭', async () => {
    const records = await createSharedProjectRecords()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({
      data: [{ ...records.httpRecord, deduplication_key: `http-flow:${'0'.repeat(64)}` }],
    } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [] } as never)
    vi.mocked(getTestData).mockResolvedValue({
      data: { ...records.httpRecord, project_id: 22 },
    } as never)

    render(<TeamCollaborationPage />)

    expect(await screen.findByText('共享 HTTP Flow')).toBeInTheDocument()
    expect(screen.queryByTestId(`team-test-data-row-${records.http.flowKey}`)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '共享 HTTP Flow' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('shared-http-flow-detail')).not.toBeInTheDocument()
  })

  test('共享 Risk 只按解析后的 flowKey 唯一关联当前 HTTP，不信任远端 test_data_id', async () => {
    const records = await createSharedProjectRecords()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [records.httpRecord] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [records.riskRecord] } as never)
    vi.mocked(getTestResult).mockResolvedValue({ data: records.riskRecord } as never)
    vi.mocked(getTestData).mockResolvedValue({ data: records.httpRecord } as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByTestId(`team-test-data-row-${records.http.flowKey}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '共享 Risk' }))

    await waitFor(() => expect(getTestData).toHaveBeenCalledWith('1', '21', '41'))
    expect(screen.getByTestId('shared-http-flow-detail')).toHaveAttribute('data-http-content', records.http.content)
    expect(screen.getByTestId('shared-http-flow-detail')).toHaveAttribute('data-risk-content', records.risk.content)
    expect(getTestData).not.toHaveBeenCalledWith('1', '21', '999')
  })

  test('文件型共享 HTTP 从详情建立索引，Risk 点击会等待当前索引完成', async () => {
    const records = await createSharedProjectRecords()
    const indexDetailRequest = createDeferred<any>()
    const fileRecord = {
      ...records.httpRecord,
      content: '',
      file_size: records.http.content.length,
      content_hash: records.http.contentHash,
    }
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [fileRecord] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [records.riskRecord] } as never)
    vi.mocked(getTestResult).mockResolvedValue({ data: records.riskRecord } as never)
    vi.mocked(getTestData)
      .mockReturnValueOnce(indexDetailRequest.promise as never)
      .mockResolvedValue({ data: records.httpRecord } as never)

    render(<TeamCollaborationPage />)
    fireEvent.click(await screen.findByRole('button', { name: '共享 Risk' }))
    await waitFor(() => expect(getTestResult).toHaveBeenCalledWith('1', '21', '51'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTestId(`team-test-data-row-${records.http.flowKey}`)).not.toBeInTheDocument()

    await act(async () => {
      indexDetailRequest.resolve({ data: records.httpRecord })
      await indexDetailRequest.promise
    })

    expect(await screen.findByTestId(`team-test-data-row-${records.http.flowKey}`)).toBeInTheDocument()
    expect(await screen.findByTestId('shared-http-flow-detail')).toHaveAttribute(
      'data-http-content',
      records.http.content,
    )
    expect(screen.getByTestId('shared-http-flow-detail')).toHaveAttribute('data-risk-content', records.risk.content)
    expect(getTestData).toHaveBeenCalledTimes(2)
    expect(getTestData).not.toHaveBeenCalledWith('1', '21', '999')
  })

  test('关联 HTTP 读取期间索引更新会显示稳定错误而不是空详情', async () => {
    const records = await createSharedProjectRecords()
    const linkedDetailRequest = createDeferred<any>()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValueOnce({ version: 4, snapshot: {} } as never)
      .mockResolvedValue({
        version: 5,
        snapshot: {},
        test_data: [{ ...records.httpRecord, name: '共享 HTTP Flow 已更新', version: 2 }],
      } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [records.httpRecord] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [records.riskRecord] } as never)
    vi.mocked(getTestResult).mockResolvedValue({ data: records.riskRecord } as never)
    vi.mocked(getTestData).mockReturnValue(linkedDetailRequest.promise as never)

    render(<TeamCollaborationPage />)
    expect(await screen.findByTestId(`team-test-data-row-${records.http.flowKey}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '共享 Risk' }))
    await waitFor(() => expect(getTestData).toHaveBeenCalledWith('1', '21', '41'))

    fireEvent.click(screen.getByRole('button', { name: '同步项目' }))
    await waitFor(() => expect(getProjectSync).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('共享 HTTP Flow 已更新')).toBeInTheDocument()

    await act(async () => {
      linkedDetailRequest.resolve({ data: records.httpRecord })
      await linkedDetailRequest.promise
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('关联流量索引已更新，请重试')
    expect(screen.queryByTestId('shared-http-flow-detail')).not.toBeInTheDocument()
  })

  test('文件型索引等待期间卸载会终止 Risk 详情请求', async () => {
    const records = await createSharedProjectRecords()
    const indexDetailRequest = createDeferred<any>()
    const fileRecord = {
      ...records.httpRecord,
      content: '',
      file_size: records.http.content.length,
      content_hash: records.http.contentHash,
    }
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [fileRecord] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [records.riskRecord] } as never)
    vi.mocked(getTestResult).mockResolvedValue({ data: records.riskRecord } as never)
    vi.mocked(getTestData).mockReturnValue(indexDetailRequest.promise as never)

    const view = render(<TeamCollaborationPage />)
    fireEvent.click(await screen.findByRole('button', { name: '共享 Risk' }))
    await waitFor(() => expect(getTestResult).toHaveBeenCalledWith('1', '21', '51'))
    expect(getTestData).toHaveBeenCalledTimes(1)

    view.unmount()
    await act(async () => {
      indexDetailRequest.resolve({ data: records.httpRecord })
      await indexDetailRequest.promise
      await Promise.resolve()
    })

    expect(getTestData).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('shared-http-flow-detail')).not.toBeInTheDocument()
  })

  test('共享 Risk 没有同步关联流量或关联不唯一时不读取任何远端 Flow 详情', async () => {
    const records = await createSharedProjectRecords()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [records.riskRecord] } as never)
    vi.mocked(getTestResult).mockResolvedValue({ data: records.riskRecord } as never)

    const view = render(<TeamCollaborationPage />)
    fireEvent.click(await screen.findByRole('button', { name: '共享 Risk' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('关联流量尚未同步')
    expect(getTestData).not.toHaveBeenCalled()

    const duplicate = { ...records.httpRecord, id: 42, name: '共享 HTTP Flow 副本' }
    vi.mocked(listTestData).mockResolvedValue({ data: [records.httpRecord, duplicate] } as never)
    view.unmount()
    render(<TeamCollaborationPage />)
    expect(await screen.findAllByTestId(`team-test-data-row-${records.http.flowKey}`)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '共享 Risk' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('关联流量记录不唯一')
    expect(getTestData).not.toHaveBeenCalled()
  })

  test('分享成功事件和刷新按钮都只通过当前项目权威接口重载记录', async () => {
    const records = await createSharedProjectRecords()
    const refreshRequest = createDeferred<any>()
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
    vi.mocked(listTestData)
      .mockResolvedValueOnce({ data: [] } as never)
      .mockReturnValueOnce(refreshRequest.promise as never)
      .mockResolvedValue({ data: [records.httpRecord] } as never)
    vi.mocked(listTestResults).mockResolvedValue({ data: [] } as never)

    render(<TeamCollaborationPage />)
    await waitFor(() => expect(listTestData).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(
        new CustomEvent('yakit:team-shared-records-refresh', {
          detail: { teamId: 1, projectId: 21 },
        }),
      )
    })
    await waitFor(() => expect(listTestData).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId(`team-test-data-row-${records.http.flowKey}`)).not.toBeInTheDocument()

    await act(async () => {
      refreshRequest.resolve({ data: [records.httpRecord] })
      await refreshRequest.promise
    })
    expect(await screen.findByTestId(`team-test-data-row-${records.http.flowKey}`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(listTestData).toHaveBeenCalledTimes(3))
  })

  test('畸形分享刷新事件不抛错也不触发上下文重载', async () => {
    render(<TeamCollaborationPage />)
    await waitFor(() => expect(listTestData).toHaveBeenCalledTimes(1))
    const eventError = vi.fn((event: ErrorEvent) => event.preventDefault())
    window.addEventListener('error', eventError)

    act(() => {
      window.dispatchEvent(new Event('yakit:team-shared-records-refresh'))
      window.dispatchEvent(
        new CustomEvent('yakit:team-shared-records-refresh', {
          detail: null,
        }),
      )
      window.dispatchEvent(
        new CustomEvent('yakit:team-shared-records-refresh', {
          detail: { teamId: '1', projectId: 21 },
        }),
      )
      window.dispatchEvent(
        new CustomEvent('yakit:team-shared-records-refresh', {
          detail: { teamId: 2, projectId: 21 },
        }),
      )
    })
    window.removeEventListener('error', eventError)

    expect(eventError).not.toHaveBeenCalled()
    expect(listTestData).toHaveBeenCalledTimes(1)
    expect(listTestResults).toHaveBeenCalledTimes(1)
  })
})
