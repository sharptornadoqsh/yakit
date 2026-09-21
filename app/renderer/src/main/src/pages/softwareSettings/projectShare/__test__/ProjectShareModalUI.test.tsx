import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectShareModal } from '../ProjectShareModal'

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  failed: vi.fn(),
  invoke: vi.fn(),
  resolver: vi.fn(),
  teams: vi.fn(),
  shares: vi.fn(),
}))
vi.mock('../projectShareRuntime', () => ({
  publishProjectShare: mocks.publish,
  importProjectShare: vi.fn(),
  resumeProjectShareImport: vi.fn(),
}))
vi.mock('../projectShareElectronRuntime', () => ({
  createElectronProjectShareRuntimeDependencies: () => ({ listRecoveries: async () => [] }),
}))
vi.mock('@/utils/notification', () => ({ success: vi.fn(), yakitFailed: mocks.failed }))
vi.mock('@/utils/clipboard', () => ({ setClipboardText: vi.fn() }))
vi.mock('@/utils/envfile', () => ({ isIRify: () => false }))
vi.mock('@/services/teamCollaboration', () => ({
  listTeams: (...args) => mocks.teams(...args),
  listTeamProjects: async () => ({
    data: [
      { id: 8, name: '其他项目' },
      { id: 9, name: '目标项目' },
    ],
  }),
  listProjectShares: (...args) => mocks.shares(...args),
}))
vi.mock('antd', () => {
  const Form = Object.assign(({ children }) => <div>{children}</div>, {
    Item: ({ label, children }) => (
      <label>
        {label}
        {children}
      </label>
    ),
  })
  return {
    Form,
    InputNumber: ({ value, onChange, disabled }) => (
      <input type="number" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    ),
    Select: ({ options, value, onChange, mode, disabled, ...props }) => (
      <select
        value={value ?? (mode === 'multiple' ? [] : '')}
        multiple={mode === 'multiple'}
        disabled={disabled}
        aria-label={props['aria-label'] || props['data-testid']}
        onChange={(e) =>
          onChange(
            mode === 'multiple' ? Array.from(e.target.selectedOptions, (o) => Number(o.value)) : Number(e.target.value),
          )
        }
      >
        {(options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ),
    Switch: () => null,
    Table: () => null,
  }
})
vi.mock('@/components/renyanUI', () => ({
  RuiYanModal: ({ open, children, footer }) =>
    open ? (
      <div role="dialog">
        {children}
        {footer}
      </div>
    ) : null,
  RuiYanButton: ({ children, disabled, loading, onClick }) => (
    <button disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  ),
}))
vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => {
  const Input = ({ value, onChange, disabled, type }: any) => (
    <input value={value || ''} onChange={onChange} disabled={disabled} type={type} />
  )
  return { YakitInput: Object.assign(Input, { Password: (props) => <Input {...props} type="password" /> }) }
})
vi.mock('../ProjectShareModal.module.scss', () => ({ default: new Proxy({}, { get: (_target, name) => name }) }))

const material = {
  scriptName: '插件源码',
  type: 'yak',
  version: 2,
  fileHash: 'a'.repeat(64),
  contentBase64: 'eWFraXQuSW5mbygxKQ==',
  metadata: { params: [], tags: [], author: '作者', help: '帮助' },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.teams.mockResolvedValue({
    data: [
      { id: 2, name: '其他团队' },
      { id: 3, name: '目标团队' },
    ],
  })
  mocks.shares.mockResolvedValue({ data: [] })
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: { invoke: mocks.invoke } }),
  })
  mocks.invoke.mockImplementation(async (channel) =>
    channel === 'GetProjectShareTarget'
      ? { baseUrl: 'http://fixture.local' }
      : { Data: [{ Id: 7, ScriptName: '插件源码', Type: 'yak' }], Total: 1 },
  )
  mocks.resolver.mockResolvedValue({
    engine: { version: '1.4.8-beta3', commit: 'unreported-by-engine', exportFormat: 'yakitproject' },
    plugins: [material],
  })
  mocks.publish.mockResolvedValue({ token: 'local-fixture-token', share: { id: 4, snapshot_id: 44, version: 2 } })
})
afterEach(cleanup)

const props = {
  open: true,
  mode: 'share' as const,
  localProject: { id: 17, name: '本地来源' },
  initialTarget: { teamId: 3, projectId: 9 },
  resolvePublishContext: mocks.resolver,
  onClose: vi.fn(),
}
const selectMaterial = async () => {
  await waitFor(() => expect(screen.getByLabelText('project-share-project-selector')).toHaveValue('9'))
  fireEvent.change(screen.getByLabelText('密令名称'), { target: { value: '交付快照' } })
  const selector = screen.getByLabelText('携带的本地插件') as HTMLSelectElement
  selector.options[0].selected = true
  fireEvent.change(selector)
  fireEvent.change(screen.getByLabelText('本次插件快照版本'), { target: { value: '2' } })
}

describe('完整分享入口接线', () => {
  it('关闭重开后加载失败，不残留上次的发布目标', async () => {
    const view = render(<ProjectShareModal {...props} />)
    await selectMaterial()
    view.rerender(<ProjectShareModal {...props} open={false} />)
    mocks.teams.mockRejectedValueOnce(new Error('加载断开'))
    view.rerender(<ProjectShareModal {...props} />)
    await waitFor(() => expect(mocks.failed).toHaveBeenCalledWith(expect.stringContaining('加载断开')))
    expect(screen.getByLabelText('project-share-project-selector')).not.toHaveValue('9')
    expect(screen.getByRole('button', { name: '发布完整环境并创建密令' })).toBeDisabled()
  })
  it('已创建密令后刷新列表失败，不将发布结果改判为失败', async () => {
    render(<ProjectShareModal {...props} />)
    await selectMaterial()
    mocks.shares.mockRejectedValueOnce(new Error('刷新断开'))
    fireEvent.click(screen.getByRole('button', { name: '发布完整环境并创建密令' }))
    await waitFor(() =>
      expect(mocks.failed).toHaveBeenCalledWith(expect.stringContaining('环境已发布，但刷新密令列表失败')),
    )
    expect(screen.getByText('local-fixture-token')).toBeInTheDocument()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })
  it.each([
    { teamId: 99, projectId: 9 },
    { teamId: 3, projectId: 99 },
  ])('预选目标缺失时不静默改发其他团队或项目', async (initialTarget) => {
    render(<ProjectShareModal {...props} initialTarget={initialTarget} />)
    await waitFor(() => expect(mocks.failed).toHaveBeenCalledWith(expect.stringContaining('已不可用')))
    expect(screen.getByRole('button', { name: '发布完整环境并创建密令' })).toBeDisabled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('保留选定服务/团队/远端项目/本地项目，并把明确选中的真实材料送入现有发布链路', async () => {
    render(<ProjectShareModal {...props} />)
    expect(screen.getByRole('button', { name: '发布完整环境并创建密令' })).toBeDisabled()
    await selectMaterial()
    fireEvent.click(screen.getByRole('button', { name: '发布完整环境并创建密令' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(mocks.resolver).toHaveBeenCalledWith(17, { pluginIds: [7], pluginVersion: 2 })
    expect(mocks.publish.mock.calls[0][0]).toMatchObject({
      teamId: 3,
      onlineProjectId: 9,
      localProject: { id: 17, name: '本地来源' },
      plugins: [material],
    })
    expect(await screen.findByText(/已发布版本：快照 #44/)).toBeInTheDocument()
    expect(screen.getByText(/目标服务：http:\/\/fixture.local/)).toBeInTheDocument()
  })
  it('材料数量不完整保留失败，不发布空插件快照', async () => {
    mocks.resolver.mockResolvedValue({ engine: {}, plugins: [] })
    render(<ProjectShareModal {...props} />)
    await selectMaterial()
    fireEvent.click(screen.getByRole('button', { name: '发布完整环境并创建密令' }))
    await waitFor(() => expect(mocks.failed).toHaveBeenCalledWith(expect.stringContaining('材料不完整')))
    expect(mocks.publish).not.toHaveBeenCalled()
  })
  it('目标服务变化后在发布前停止', async () => {
    render(<ProjectShareModal {...props} />)
    await selectMaterial()
    mocks.invoke.mockResolvedValue({ baseUrl: 'http://another.local' })
    fireEvent.click(screen.getByRole('button', { name: '发布完整环境并创建密令' }))
    await waitFor(() => expect(mocks.failed).toHaveBeenCalledWith(expect.stringContaining('发布目标')))
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})
