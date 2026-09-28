import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TeamRecordBatchPanel } from '../TeamRecordBatchPanel'
import { runTeamRecordBatch, BatchShareOptions, BatchShareResult } from '../sharedRecordBatch'
import { publishTeamPermissionInvalidation } from '../teamPermissionContext'

vi.mock('../sharedRecordBatch', () => ({ runTeamRecordBatch: vi.fn() }))
vi.mock('@/utils/envfile', () => ({ isIRify: () => false }))
vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({
  YakitButton: ({ children, ...props }) => <button {...props}>{children}</button>,
}))

const props = {
  teamId: 1,
  projectId: 10,
  localProjectId: 77,
  localProjectName: '本地项目',
  baseUrl: 'https://team.test',
  userId: 7,
  token: 'token-a',
  canShareHTTP: true,
  canShareRisk: true,
  disabled: false,
}
let pending: BatchShareOptions
let finish: (result: BatchShareResult) => void
const result: BatchShareResult = {
  phase: 'done',
  total: 2,
  success: 1,
  duplicate: 0,
  failures: [{ kind: 'risk', id: 5, message: '暂时失败' }],
  pending: [],
  stoppedReason: '',
}
beforeEach(() => {
  vi.mocked(runTeamRecordBatch)
    .mockReset()
    .mockImplementation((options) => {
      pending = options
      return new Promise((resolve) => {
        finish = resolve
      })
    })
})
afterEach(cleanup)
const begin = () => {
  fireEvent.click(screen.getByRole('button', { name: '共享流量/漏洞到团队' }))
  fireEvent.click(screen.getByRole('checkbox', { name: '该本地项目的全部 HTTP 流量' }))
  fireEvent.click(screen.getByRole('button', { name: '确认逐条共享' }))
}

test.each([
  { teamId: 2 },
  { projectId: 20 },
  { localProjectId: 88 },
  { baseUrl: 'https://other.test' },
  { userId: 8, token: 'token-b' },
])('界面目标变化时终止旧任务 %j', async (change) => {
  const view = render(<TeamRecordBatchPanel {...props} />)
  begin()
  expect(pending.isCurrent()).toBe(true)
  view.rerender(<TeamRecordBatchPanel {...props} {...change} />)
  expect(pending.signal.aborted).toBe(true)
  expect(pending.isCurrent()).toBe(false)
  await act(async () => {
    pending.onProgress(result)
    finish(result)
  })
  expect(screen.getByRole('button', { name: '仅重试失败记录' })).toBeDisabled()
})

test('取消和权限失效中止任务，双击不启动第二个任务', async () => {
  render(<TeamRecordBatchPanel {...props} />)
  begin()
  fireEvent.click(screen.getByRole('button', { name: '确认逐条共享' }))
  expect(runTeamRecordBatch).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '取消共享' }))
  expect(pending.signal.aborted).toBe(true)
  act(() => publishTeamPermissionInvalidation(1))
  await act(async () => finish(result))
})

test('失败重试仅传入失败 ID，保留正常结果不重传', async () => {
  render(<TeamRecordBatchPanel {...props} />)
  begin()
  await act(async () => {
    pending.onProgress(result)
    finish(result)
  })
  expect(screen.getByText(/成功 1，重复 0，失败 1/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '仅重试失败记录' }))
  expect(pending.retryItems).toEqual(result.failures)
  await act(async () => finish(result))
})

test('严格模式挂载和卸载维持取消边界', async () => {
  const view = render(
    <React.StrictMode>
      <TeamRecordBatchPanel {...props} />
    </React.StrictMode>,
  )
  begin()
  expect(pending.isCurrent()).toBe(true)
  view.unmount()
  expect(pending.signal.aborted).toBe(true)
  expect(pending.isCurrent()).toBe(false)
  await act(async () => finish(result))
})

test('确认共享结果后仅刷新当前目标的数据', async () => {
  const onShared = vi.fn()
  render(<TeamRecordBatchPanel {...props} onShared={onShared} />)
  begin()
  await act(async () => finish(result))
  expect(onShared).toHaveBeenCalledTimes(1)
})
