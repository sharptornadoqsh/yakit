import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TeamCollaborationPage } from '../TeamCollaborationPage'
import { restoreTeamProjectBundle } from '../teamProjectBundle'
import {
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

vi.mock('@/services/teamCollaboration', () => ({
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
}))

vi.mock('../teamProjectBundle', async () => {
  const actual = await vi.importActual<typeof import('../teamProjectBundle')>('../teamProjectBundle')
  return { ...actual, restoreTeamProjectBundle: vi.fn() }
})

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

describe('团队协作页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['project.read'],
            projects: [],
          },
          {
            member: { id: 12, team_id: 2, user_id: 7, status: 'active' },
            team: { id: 2, name: '红队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['project.read'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['project.read'],
            projects: [],
          },
          {
            member: { id: 12, team_id: 2, user_id: 7, status: 'active' },
            team: { id: 2, name: '红队' },
            roles: [{ code: 'tester', name: '测试人员' }],
            permissions: ['project.read'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'maintainer', name: '维护人员' }],
            permissions: ['project.manage'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['test_data.read', 'test_data.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'maintainer', name: '维护人员' }],
            permissions: ['project.manage', 'test_data.write', 'test_result.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['test_data.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['test_data.read', 'test_data.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['test_data.read', 'test_data.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'data_writer', name: '数据维护人员' }],
            permissions: ['test_data.read', 'test_data.write'],
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

  test('创建接口失败时保留测试结果编辑内容且省略空关联字段', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'result_writer', name: '结果维护人员' }],
            permissions: ['test_result.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'maintainer', name: '维护人员' }],
            permissions: ['test_data.write'],
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
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
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

  test('管理员角色获得团队写入入口', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
            team: { id: 1, name: '蓝队' },
            roles: [{ code: 'administrator', name: '管理员' }],
            permissions: [],
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

    expect(screen.getByPlaceholderText('输入项目名称')).not.toBeDisabled()
    expect(screen.getByPlaceholderText('测试数据名称')).not.toBeDisabled()
    expect(screen.getByPlaceholderText('测试结果名称')).not.toBeDisabled()
    expect(screen.getByText('写入权限')).toBeInTheDocument()
  })

  test('没有审计权限时不请求审计接口', async () => {
    vi.mocked(getMe).mockResolvedValue({
      data: {
        user: { id: 7, name: '小周' },
        memberships: [
          {
            member: { id: 11, team_id: 1, user_id: 7, status: 'active' },
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
})
