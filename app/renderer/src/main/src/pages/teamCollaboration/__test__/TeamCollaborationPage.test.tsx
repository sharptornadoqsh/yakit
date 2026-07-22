import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TeamCollaborationPage } from '../TeamCollaborationPage'
import {
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

describe('团队协作页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
