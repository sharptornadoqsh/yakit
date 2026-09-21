import React, { useState } from 'react'
import { EventEmitter } from 'events'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NewProjectAndFolder } from '../ProjectManage'

const mocks = vi.hoisted(() => {
  const ipc = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() }
  Object.defineProperty(window, 'require', { configurable: true, value: () => ({ ipcRenderer: ipc }) })
  return { ...ipc, failed: vi.fn(), completed: vi.fn(), t: (key: string) => key }
})
vi.mock('@/assets/newIcon', () => ({
  ChevronDownIcon: () => null,
  ChevronRightIcon: () => null,
  ChevronUpIcon: () => null,
  OutlinePlusIcon: () => null,
  PlusIcon: () => null,
  QuestionMarkCircleIcon: () => null,
  ResizerIcon: () => null,
  TrashIcon: () => null,
}))
vi.mock('@/assets/icon/outline', () => ({
  OutlineExportIcon: () => null,
  OutlinePencilaltIcon: () => null,
  OutlineTrashIcon: () => null,
}))
vi.mock('../icon', () => ({
  ProjectDocumentTextSvgIcon: () => null,
  ProjectFolderOpenSvgIcon: () => null,
  ProjectViewGridSvgIcon: () => null,
  ProjectExportSvgIcon: () => null,
  ProjectImportSvgIcon: () => null,
}))
vi.mock('@/i18n/useI18nNamespaces', () => ({ useI18nNamespaces: () => ({ t: mocks.t, i18n: { language: 'zh' } }) }))
vi.mock('@/utils/notification', () => ({
  failed: mocks.failed,
  info: vi.fn(),
  warn: vi.fn(),
  success: vi.fn(),
  yakitFailed: mocks.failed,
}))
vi.mock('@/utils/envfile', () => ({ isIRify: () => false, isCommunityEdition: () => true, isEnpriTrace: () => false }))
vi.mock('@/utils/openWebsite', () => ({ openABSFileLocated: vi.fn() }))
vi.mock('@/utils/timeUtil', () => ({ formatTimestamp: vi.fn() }))
vi.mock('../projectBranding', () => ({ getProjectDisplayText: (_name, value) => value }))
vi.mock('@/utils/clipboard', () => ({ setClipboardText: vi.fn() }))
vi.mock('@/utils/eventBus/eventBus', () => ({ default: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }))
vi.mock('@/store', () => ({ useEeSystemConfig: () => ({ eeSystemConfig: [] }), useStore: () => ({ userInfo: {} }) }))
vi.mock('@/store/temporaryProject', () => ({
  useTemporaryProjectStore: () => ({ isExportTemporaryProjectFlag: false, setIsExportTemporaryProjectFlag: vi.fn() }),
}))
vi.mock('@/components/layout/utils', () => ({ useUploadInfoByEnpriTrace: vi.fn() }))
vi.mock('@/components/yakitUI/YakitTag/YakitTag', () => ({ CopyComponents: () => null, YakitTag: () => null }))
vi.mock('@/components/yakitUI/YakitMenu/YakitMenu', () => ({ YakitMenu: () => null }))
vi.mock('@/components/yakitUI/YakitMenu/showByRightContext', () => ({ showByRightContext: vi.fn() }))
vi.mock('@/components/yakitUI/YakitSpin/YakitSpin', () => ({ YakitSpin: () => null }))
vi.mock('@/components/yakitUI/YakitHint/YakitHint', () => ({ YakitHint: () => null }))
vi.mock('@/components/yakitUI/YakitEmpty/YakitEmpty', () => ({ YakitEmpty: () => null }))
vi.mock('@/components/yakitUI/YakitCollapse/YakitCollapse', () => ({ default: { YakitPanel: () => null } }))
vi.mock('@/pages/fuzzer/components/AutoTextarea/AutoTextarea', () => ({ AutoTextarea: () => null }))
vi.mock('../projectShare/ProjectShareModal', () => ({ ProjectShareModal: () => null }))
vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => {
  const Input = React.forwardRef<HTMLInputElement, any>(
    ({ value, onChange, placeholder, disabled, className, type, 'aria-label': label }, ref) => (
      <input
        ref={ref}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        type={type}
        aria-label={label}
      />
    ),
  )
  return {
    YakitInput: Object.assign(Input, { Password: (props) => <Input {...props} type="password" />, TextArea: Input }),
  }
})
vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/renyanUI', async () => ({
  ...(await import('@/components/renyanUI/RuiYanPrimitives')),
  RuiYanIcon: () => null,
}))
vi.mock('@/components/renyanUI/RuiYanUI.module.scss', () => ({
  default: new Proxy({}, { get: (_target, key) => key }),
}))
vi.mock('../ProjectManage.module.scss', () => ({ default: new Proxy({}, { get: (_target, key) => key }) }))

const events = new EventEmitter()
let token = ''
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  events.removeAllListeners()
  mocks.on.mockImplementation(events.on.bind(events))
  mocks.removeListener.mockImplementation(events.removeListener.bind(events))
  mocks.invoke.mockImplementation(async (channel, _params, nextToken) => {
    if (channel === 'GetProjects') return { Projects: [] }
    if (channel === 'InspectProjectImportFile') return { encrypted: false, format: 'project-archive' }
    if (channel === 'fetch-path-file-name') return 'demo'
    if (channel === 'ImportProject') token = nextToken
  })
})
afterEach(cleanup)

const Harness = () => {
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>打开导入</button>
      <NewProjectAndFolder
        visible={open}
        isNew={false}
        isImport
        loading={loading}
        setLoading={setLoading}
        setVisible={setOpen}
        onModalSubmit={mocks.completed}
      />
    </>
  )
}
const start = async (file = '/tmp/project.ruiyanproject') => {
  fireEvent.change(screen.getByLabelText('项目文件路径'), { target: { value: file } })
  fireEvent.click(screen.getByRole('button', { name: 'YakitButton.import' }))
  await screen.findByTestId('project-transfer-content')
}

describe('真实父弹窗、表单与进度集成', () => {
  it('同一个 dialog 内显示进度，两次失败后第三次成功且错误可读', async () => {
    render(<Harness />)
    for (let attempt = 0; attempt < 2; attempt++) {
      await start()
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      expect(within(screen.getByRole('dialog')).getByTestId('project-transfer-content')).toBeInTheDocument()
      expect(screen.getByTestId('project-transfer-content')).not.toHaveClass('transfer-project-mask')
      const currentToken = token
      await act(async () => {
        events.emit(`${currentToken}-error`, {}, '损坏归档')
      })
      expect(screen.getByRole('alert', { name: '项目导入错误' })).toHaveTextContent('损坏归档')
      expect(screen.getByLabelText('项目文件路径')).toBeVisible()
      expect(events.eventNames()).toEqual([])
    }
    await start()
    await act(async () => {
      events.emit(`${token}-end`, {}, { ProjectId: 17, DatabasePath: '/project.db' })
    })
    expect(mocks.completed).toHaveBeenCalledTimes(1)
  })
  it('取消与关闭重开回到表单，旧 token 的事件不污染新操作', async () => {
    render(<Harness />)
    await start()
    const oldToken = token
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.cancel' }))
    await waitFor(() => expect(events.eventNames()).toEqual([]))
    expect(screen.getByLabelText('项目文件路径')).toBeVisible()
    await start()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(events.eventNames()).toEqual([]))
    fireEvent.click(screen.getByRole('button', { name: '打开导入' }))
    expect(screen.getByLabelText('项目文件路径')).toHaveValue('')
    await start()
    await act(async () => {
      events.emit(`${oldToken}-end`, {}, { ProjectId: 17, DatabasePath: '/project.db' })
    })
    expect(mocks.completed).not.toHaveBeenCalled()
    await act(async () => {
      events.emit(`${token}-error`, {}, '引擎断开')
    })
    expect(screen.getByRole('alert', { name: '项目导入错误' })).toHaveTextContent('引擎断开')
  })
  it('手动输入报告在 IPC 前阻断，内容预检失败保持可选文件的表单', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('项目文件路径'), { target: { value: '/tmp/report.pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.import' }))
    expect(await screen.findByRole('alert', { name: '项目导入错误' })).toHaveTextContent('PDF 是报告')
    expect(mocks.invoke.mock.calls.some(([channel]) => channel === 'ImportProject')).toBe(false)
    fireEvent.change(screen.getByLabelText('项目文件路径'), { target: { value: '/tmp/fake.db' } })
    mocks.invoke.mockImplementation(async (channel) => {
      if (channel === 'InspectProjectImportFile') throw new Error('DATABASE_INVALID')
    })
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.import' }))
    expect(await screen.findByRole('alert', { name: '项目导入错误' })).toHaveTextContent('DATABASE_INVALID')
    expect(screen.getByLabelText('项目文件路径')).toBeVisible()
  })
  it('预检期间父弹窗关闭后，迟到的校验结果不会启动导入', async () => {
    let complete: (value: unknown) => void = () => {}
    mocks.invoke.mockImplementation(async (channel) => {
      if (channel === 'GetProjects') return { Projects: [] }
      if (channel === 'InspectProjectImportFile')
        return new Promise((resolve) => {
          complete = resolve
        })
    })
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('项目文件路径'), { target: { value: '/tmp/project.db' } })
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.import' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await act(async () => {
      complete({ encrypted: false })
    })
    expect(mocks.invoke.mock.calls.some(([channel]) => channel === 'ImportProject')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '打开导入' }))
    expect(screen.getByLabelText('项目文件路径')).toHaveValue('')
  })
})
