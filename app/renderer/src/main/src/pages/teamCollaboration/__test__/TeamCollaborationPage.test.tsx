import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TeamCollaborationPage } from '../TeamCollaborationPage'
import { restoreTeamProjectBundle } from '../teamProjectBundle'
import {
  createTestData,
  createTestResult,
  getProjectSync,
  listAuditLogs,
  listProjectMembers,
  listTeamMembers,
  listTeamProjects,
  listTeams,
  listTestData,
  listTestResults,
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
  const Select = ({ children, onChange, placeholder, ...props }) => (
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
  listTeams: vi.fn(),
  listTeamMembers: vi.fn(),
  listTeamProjects: vi.fn(),
  createTeamProject: vi.fn(),
  listProjectMembers: vi.fn(),
  getProjectSync: vi.fn(),
  updateProjectSnapshot: vi.fn(),
  listTestData: vi.fn(),
  createTestData: vi.fn(),
  listTestResults: vi.fn(),
  createTestResult: vi.fn(),
  listAuditLogs: vi.fn(),
}))

vi.mock('../teamProjectBundle', async () => {
  const actual = await vi.importActual<typeof import('../teamProjectBundle')>('../teamProjectBundle')
  return { ...actual, restoreTeamProjectBundle: vi.fn() }
})

describe('团队协作页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: undefined,
    })
    vi.mocked(listTeams).mockResolvedValue({
      data: [{ id: 1, name: '蓝队', role: 'viewer', permissions: ['project:read'] }],
    } as never)
    vi.mocked(listTeamMembers).mockResolvedValue({
      data: [{ id: 11, user_name: '小周', role_name: '观察员', status: 'active' }],
    } as never)
    vi.mocked(listTeamProjects).mockResolvedValue({
      data: [{ id: 21, name: '供应链评估', version: 4, updated_at: '2026-07-22T08:00:00Z' }],
    } as never)
    vi.mocked(listProjectMembers).mockResolvedValue({
      data: [{ id: 31, user_name: '小周', access_level: 'read' }],
    } as never)
    vi.mocked(listTestData).mockResolvedValue({ data: [{ id: 41, name: '登录样本', version: 2 }] } as never)
    vi.mocked(listTestResults).mockResolvedValue({
      data: [{ id: 51, name: '基线结果', status: 'passed', summary: '通过' }],
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
    expect(screen.getByText('登录样本')).toBeInTheDocument()
    expect(screen.getByText('基线结果')).toBeInTheDocument()
    expect(screen.getByText('snapshot.update')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试同步' }))

    await waitFor(() => expect(getProjectSync).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/最近同步/)).toBeInTheDocument()
  })

  test('按服务端请求契约创建共享测试数据和结果', async () => {
    vi.mocked(listTeams).mockResolvedValue({
      data: [{ id: 1, name: '蓝队', role: 'editor', permissions: ['project:write'] }],
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
    await waitFor(() => expect(createTestData).toHaveBeenCalledTimes(1))
    expect(createTestData).toHaveBeenCalledWith(
      '1',
      '21',
      expect.objectContaining({
        name: '请求样本',
        type: 'manual',
        content: '{}',
      }),
    )

    fireEvent.change(screen.getByPlaceholderText('测试结果名称'), { target: { value: '验证结果' } })
    fireEvent.click(screen.getByRole('button', { name: '新增结果' }))
    await waitFor(() => expect(createTestResult).toHaveBeenCalledTimes(1))
    expect(createTestResult).toHaveBeenCalledWith(
      '1',
      '21',
      expect.objectContaining({
        name: '验证结果',
        type: 'manual',
        content: JSON.stringify({ summary: '' }),
      }),
    )
  })

  test('同名项目默认创建副本，也可在生成备份后覆盖本地项目', async () => {
    vi.mocked(getProjectSync)
      .mockReset()
      .mockResolvedValue({ version: 4, snapshot: {} } as never)
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
      }),
      expect.any(Object),
    )
  })
})
