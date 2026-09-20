import React, { useState } from 'react'
import { EventEmitter } from 'events'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ failed: vi.fn(), invoke: vi.fn(), success: vi.fn(), t: (key: string) => key }))
vi.mock('@/utils/notification', () => ({ failed: mocks.failed }))
vi.mock('@/utils/openWebsite', () => ({ openABSFileLocated: vi.fn() }))
vi.mock('@/utils/envfile', () => ({ isIRify: () => false }))
vi.mock('@/utils/eventBus/eventBus', () => ({ default: { emit: vi.fn() } }))
vi.mock('@/store/temporaryProject', () => ({
  useTemporaryProjectStore: () => ({ isExportTemporaryProjectFlag: false, setIsExportTemporaryProjectFlag: vi.fn() }),
}))
vi.mock('@/i18n/useI18nNamespaces', () => ({ useI18nNamespaces: () => ({ t: mocks.t }) }))
vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
}))
vi.mock('antd', () => ({ Progress: ({ percent }) => <div data-testid="progress">{percent}</div> }))
vi.mock('../icon', () => ({ ProjectExportSvgIcon: () => null, ProjectImportSvgIcon: () => null }))
vi.mock('../ProjectManage.module.scss', () => ({ default: new Proxy({}, { get: (_target, name) => name }) }))

const events = new EventEmitter()
let TransferProject: typeof import('../TransferProject').TransferProject
let token = ''

beforeAll(async () => {
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({
      ipcRenderer: {
        invoke: mocks.invoke,
        on: events.on.bind(events),
        removeListener: events.removeListener.bind(events),
      },
    }),
  })
  TransferProject = (await import('../TransferProject')).TransferProject
}, 60000)
beforeEach(() => {
  vi.clearAllMocks()
  events.removeAllListeners()
  mocks.invoke.mockImplementation(async (channel, _params, nextToken) => {
    if (channel === 'ImportProject') token = nextToken
  })
})
afterEach(cleanup)

const FormHarness = () => {
  const [visible, setVisible] = useState(true)
  return (
    <>
      {!visible && <button onClick={() => setVisible(true)}>重新导入</button>}
      <TransferProject
        visible={visible}
        isImport
        data={{ ProjectFilePath: 'project.ruiyanproject' }}
        setVisible={setVisible}
        onSuccess={mocks.success}
      />
    </>
  )
}

describe('项目传输进度组件恢复', () => {
  it('失败无结束事件时恢复操作，重复失败后仍可成功', async () => {
    render(<FormHarness />)
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        events.emit(`${token}-error`, {}, '文件损坏')
      })
      expect(await screen.findByRole('button', { name: '重新导入' })).toBeInTheDocument()
      expect(mocks.success).not.toHaveBeenCalled()
      expect(events.eventNames()).toEqual([])
      fireEvent.click(screen.getByRole('button', { name: '重新导入' }))
    }
    await act(async () => {
      events.emit(`${token}-end`)
    })
    expect(mocks.success).toHaveBeenCalledTimes(1)
    expect(mocks.success).toHaveBeenCalledWith('isImport')
  })
  it('IPC 拒绝后恢复按钮，不永久遮罩', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('引擎已断开'))
    render(<FormHarness />)
    expect(await screen.findByRole('button', { name: '重新导入' })).toBeInTheDocument()
    expect(mocks.failed).toHaveBeenCalledWith(expect.stringContaining('引擎已断开'))
    expect(events.eventNames()).toEqual([])
  })
  it('取消后关闭并清理，旧事件不触发成功', async () => {
    render(<FormHarness />)
    const oldToken = token
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.cancel' }))
    await waitFor(() => expect(events.eventNames()).toEqual([]))
    fireEvent.click(screen.getByRole('button', { name: '重新导入' }))
    expect(token).not.toBe(oldToken)
    await act(async () => {
      events.emit(`${oldToken}-end`)
      events.emit(`${oldToken}-error`, {}, '旧事件')
    })
    expect(mocks.success).not.toHaveBeenCalled()
    await act(async () => {
      events.emit(`${token}-end`)
    })
    expect(mocks.success).toHaveBeenCalledTimes(1)
  })
  it('父弹窗关闭再打开使用新操作，卸载取消运行流', async () => {
    const props = {
      isImport: true,
      data: { ProjectFilePath: 'project.ruiyanproject' },
      setVisible: vi.fn(),
      onSuccess: mocks.success,
    }
    const view = render(<TransferProject {...props} visible />)
    const oldToken = token
    view.rerender(<TransferProject {...props} visible={false} />)
    expect(events.eventNames()).toEqual([])
    expect(mocks.invoke).toHaveBeenCalledWith('cancel-ImportProject', oldToken)
    view.rerender(<TransferProject {...props} visible />)
    const nextToken = token
    expect(nextToken).not.toBe(oldToken)
    view.unmount()
    expect(mocks.invoke).toHaveBeenCalledWith('cancel-ImportProject', nextToken)
    expect(events.eventNames()).toEqual([])
  })
})
