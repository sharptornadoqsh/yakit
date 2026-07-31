import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CurrentCollaborationUser } from '@/services/teamCollaboration'
import { publishTeamAuthenticationInvalidation, publishTeamPermissionInvalidation } from '../teamPermissionContext'
import {
  ShareToTeamProjectModal,
  getShareTargetCapabilities,
  matchDuplicateHTTPRecord,
  matchDuplicateRiskRecord,
} from '../ShareToTeamProjectModal'
import {
  PreparedSharedHTTPFlow,
  PreparedSharedRisk,
  PreparedTeamShare,
  prepareSharedHTTPFlow,
  prepareSharedRisk,
} from '../sharedRecordAdapters'
import { MAX_SHARED_RECORD_CONTENT_BYTES, decodeBase64Strict } from '../binaryPayload'

var storeUserInfo = {
  isLogin: true,
  user_id: 7,
  token: 'token-a',
}
var getMeMock = vi.fn()
var createTestDataMock = vi.fn()
var createTestResultMock = vi.fn()
var ipcInvokeMock = vi.fn()

vi.mock('@/store', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({ userInfo: storeUserInfo }),
}))

vi.mock('@/services/teamCollaboration', () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
  createTestData: (...args: unknown[]) => createTestDataMock(...args),
  createTestResult: (...args: unknown[]) => createTestResultMock(...args),
}))

vi.mock('@/components/yakitUI/YakitModal/YakitModal', () => ({
  YakitModal: ({
    visible,
    children,
    onCancel,
    onOk,
    okButtonProps,
    confirmLoading,
  }: {
    visible?: boolean
    children?: React.ReactNode
    onCancel?: () => void
    onOk?: () => void
    okButtonProps?: { disabled?: boolean }
    confirmLoading?: boolean
  }) =>
    visible ? (
      <div role="dialog" aria-label="分享到团队项目">
        {children}
        <button onClick={onCancel}>取消</button>
        <button onClick={onOk} disabled={okButtonProps?.disabled || confirmLoading}>
          分享
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/yakitUI/YakitSelect/YakitSelect', () => ({
  YakitSelect: ({
    value,
    onChange,
    options,
    placeholder,
    disabled,
  }: {
    value?: string
    onChange?: (value: string) => void
    options?: Array<{ value: string; label: string }>
    placeholder?: string
    disabled?: boolean
  }) => (
    <select
      aria-label={placeholder}
      value={value || ''}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">请选择</option>
      {(options || []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createCurrentUser = (
  permissions: string[] = ['test_data.write', 'test_result.write'],
  options: { secondTeam?: boolean; inactiveProject?: boolean } = {},
): CurrentCollaborationUser =>
  ({
    user: {
      id: 7,
      uid: 'user-7',
      name: '测试用户',
      nick_name: '',
      email: 'user@example.test',
      status: 'active',
      legacy_role: '',
      from_platform: '',
    },
    memberships: [
      {
        member: { id: 11, team_id: 1, user_id: 7, status: 'active', version: 3 },
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
            id: 10,
            team_id: 1,
            project_key: 'blue-main',
            name: '蓝队项目',
            description: '',
            status: options.inactiveProject ? 'disabled' : 'active',
            version: 1,
            created_by: 7,
            updated_by: 7,
          },
        ],
      },
      ...(options.secondTeam
        ? [
            {
              member: { id: 12, team_id: 2, user_id: 7, status: 'active', version: 4 },
              team: {
                id: 2,
                name: '红队',
                slug: 'red',
                description: '',
                owner_user_id: 7,
                status: 'active',
                version: 1,
              },
              roles: [],
              permissions,
              projects: [
                {
                  id: 20,
                  team_id: 2,
                  project_key: 'red-main',
                  name: '红队项目',
                  description: '',
                  status: 'active',
                  version: 1,
                  created_by: 7,
                  updated_by: 7,
                },
              ],
            },
          ]
        : []),
    ],
  }) as CurrentCollaborationUser

let preparedHTTP: PreparedSharedHTTPFlow
let preparedRisk: PreparedSharedRisk
let httpShare: PreparedTeamShare
let riskShare: PreparedTeamShare

const makeHTTPRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 77,
  team_id: 1,
  project_id: 10,
  name: preparedHTTP.name,
  data_type: 'http_flow',
  content_hash: preparedHTTP.contentHash,
  deduplication_key: `http-flow:${preparedHTTP.flowKey}`,
  source_client_id: preparedHTTP.sourceClientId,
  status: 'active',
  ...overrides,
})

const makeRiskRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 88,
  team_id: 1,
  project_id: 10,
  test_data_id: 77,
  name: preparedRisk.name,
  result_type: 'risk',
  severity: preparedRisk.summary.severity,
  content_hash: preparedRisk.contentHash,
  deduplication_key: `risk:${preparedRisk.riskKey}`,
  source_client_id: preparedRisk.sourceClientId,
  status: 'active',
  ...overrides,
})

const makeConflictError = (code: string | undefined, data: unknown) => ({
  ...(code ? { code } : {}),
  response: {
    status: 409,
    data: {
      ...(code ? { code } : {}),
      data,
    },
  },
})

beforeAll(async () => {
  preparedHTTP = await prepareSharedHTTPFlow({
    clientId: 'http-client-a',
    localFlowId: '101',
    capturedAt: '2026-07-30T08:00:00.123456789Z',
    request: decodeBase64Strict('R0VUIC9oZWFsdGggSFRUUC8xLjENCkhvc3Q6IGV4YW1wbGUudGVzdA0KDQo='),
    response: decodeBase64Strict('SFRUUC8xLjEgMjAwIE9LDQpDb250ZW50LUxlbmd0aDogMg0KDQpPSw=='),
    summary: {
      method: 'GET',
      url: 'https://example.test/health',
      host: 'example.test',
      status_code: 200,
    },
  })
  preparedRisk = await prepareSharedRisk({
    clientId: 'http-client-a',
    localRiskId: '202',
    flowKey: preparedHTTP.flowKey,
    payload: new TextEncoder().encode('{"evidence":"safe fixture"}'),
    summary: { title: 'safe fixture risk', severity: 'low', risk_type: 'fixture' },
  })
  httpShare = { kind: 'http-flow', http: preparedHTTP }
  riskShare = { kind: 'risk', http: preparedHTTP, risk: preparedRisk }
})

beforeEach(() => {
  storeUserInfo = { isLogin: true, user_id: 7, token: 'token-a' }
  getMeMock.mockReset()
  createTestDataMock.mockReset()
  createTestResultMock.mockReset()
  ipcInvokeMock.mockReset()
  ipcInvokeMock.mockResolvedValue('http-client-a')
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: { invoke: ipcInvokeMock } }),
  })
})

describe('分享目标权限', () => {
  test('只保留活动成员、团队和项目，并按精确权限码区分 Flow 与 Risk', () => {
    const httpOnly = getShareTargetCapabilities(createCurrentUser(['test_data.write']))
    expect(httpOnly.canShareHTTPFlow).toBe(true)
    expect(httpOnly.canShareRisk).toBe(false)
    expect(httpOnly.teams[0].projects.map((project) => project.id)).toEqual([10])

    const wildcard = getShareTargetCapabilities(createCurrentUser(['*']))
    expect(wildcard.canShareHTTPFlow).toBe(false)
    expect(wildcard.canShareRisk).toBe(false)

    const inactive = getShareTargetCapabilities(createCurrentUser(undefined, { inactiveProject: true }))
    expect(inactive.teams).toEqual([])
  })
})

describe('409 幂等恢复', () => {
  test('HTTP 重复记录逐字段精确匹配但忽略 file_path', () => {
    expect(matchDuplicateHTTPRecord({ ...makeHTTPRecord(), file_path: 'D:\\server-only' }, 1, 10, preparedHTTP)).toBe(
      true,
    )
    for (const [field, value] of [
      ['id', 0],
      ['team_id', 2],
      ['project_id', 20],
      ['name', 'other'],
      ['data_type', 'risk'],
      ['content_hash', '0'.repeat(64)],
      ['deduplication_key', 'http-flow:other'],
      ['source_client_id', 'other-client'],
      ['status', 'disabled'],
    ] as const) {
      expect(matchDuplicateHTTPRecord(makeHTTPRecord({ [field]: value }), 1, 10, preparedHTTP)).toBe(false)
    }
  })

  test('Risk 重复记录额外精确匹配真实 test_data_id', () => {
    expect(
      matchDuplicateRiskRecord({ ...makeRiskRecord(), file_path: 'D:\\server-only' }, 1, 10, 77, preparedRisk),
    ).toBe(true)
    for (const [field, value] of [
      ['id', 0],
      ['team_id', 2],
      ['project_id', 20],
      ['test_data_id', 78],
      ['name', 'other'],
      ['result_type', 'http_flow'],
      ['severity', 'high'],
      ['content_hash', '0'.repeat(64)],
      ['deduplication_key', 'risk:other'],
      ['source_client_id', 'other-client'],
      ['status', 'disabled'],
    ] as const) {
      expect(matchDuplicateRiskRecord(makeRiskRecord({ [field]: value }), 1, 10, 77, preparedRisk)).toBe(false)
    }
  })
})

describe('分享到团队项目 Modal', () => {
  test('HTTP Flow 提交前重新鉴权并发送标准字段', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockResolvedValue({ data: makeHTTPRecord() })
    const onSuccess = vi.fn()

    render(<ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={onSuccess} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(getMeMock).toHaveBeenCalledTimes(2)
    expect(createTestDataMock).toHaveBeenCalledWith(1, 10, {
      name: preparedHTTP.name,
      type: 'http_flow',
      content: preparedHTTP.content,
      deduplication_key: `http-flow:${preparedHTTP.flowKey}`,
      source_client_id: preparedHTTP.sourceClientId,
    })
    expect(createTestResultMock).not.toHaveBeenCalled()
  })

  test('Risk 严格先写 HTTP，再用服务端真实 Flow ID 写 Risk', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockResolvedValue({ data: makeHTTPRecord({ id: 707 }) })
    createTestResultMock.mockResolvedValue({ data: makeRiskRecord({ test_data_id: 707 }) })
    const onSuccess = vi.fn()

    render(<ShareToTeamProjectModal visible prepared={riskShare} onCancel={vi.fn()} onSuccess={onSuccess} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(createTestDataMock.mock.invocationCallOrder[0]).toBeLessThan(
      createTestResultMock.mock.invocationCallOrder[0],
    )
    expect(createTestResultMock).toHaveBeenCalledWith(1, 10, {
      test_data_id: 707,
      name: preparedRisk.name,
      type: 'risk',
      severity: preparedRisk.summary.severity,
      content: preparedRisk.content,
      deduplication_key: `risk:${preparedRisk.riskKey}`,
      source_client_id: preparedRisk.sourceClientId,
    })
  })

  test('HTTP 写入失败时绝不写 Risk', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockRejectedValue(new Error('http failed'))

    render(<ShareToTeamProjectModal visible prepared={riskShare} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await screen.findByText('分享失败，请重试')
    expect(createTestResultMock).not.toHaveBeenCalled()
  })

  test('提交前权限已撤销时不写入任何记录', async () => {
    getMeMock
      .mockResolvedValueOnce({ data: createCurrentUser() })
      .mockResolvedValueOnce({ data: createCurrentUser(['test_data.write']) })

    render(<ShareToTeamProjectModal visible prepared={riskShare} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await screen.findByText('团队权限或项目状态已变化，请重新选择')
    expect(createTestDataMock).not.toHaveBeenCalled()
    expect(createTestResultMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '分享' })).toBeDisabled()
  })

  test('服务端返回 403 时立即清空目标并失败关闭', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockRejectedValue({ response: { status: 403 } })

    render(<ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await screen.findByText('团队权限或登录状态已失效，请重新选择')
    expect(screen.getByRole('button', { name: '分享' })).toBeDisabled()
  })

  test('409 仅在现有记录精确匹配时作为成功恢复', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockRejectedValue(
      makeConflictError('duplicate_data', { ...makeHTTPRecord(), file_path: 'D:\\server-only' }),
    )
    const onSuccess = vi.fn()

    render(<ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={onSuccess} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  test.each([undefined, 'duplicate_result', 'version_conflict'])(
    'HTTP 409 错误码为 %s 时拒绝复用外观匹配的记录',
    async (code) => {
      getMeMock.mockResolvedValue({ data: createCurrentUser() })
      createTestDataMock.mockRejectedValue(makeConflictError(code, makeHTTPRecord()))
      const onSuccess = vi.fn()

      render(<ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={onSuccess} />)
      await screen.findByRole('option', { name: '蓝队项目' })
      fireEvent.click(screen.getByRole('button', { name: '分享' }))

      await screen.findByText('分享失败，请重试')
      expect(onSuccess).not.toHaveBeenCalled()
    },
  )

  test('Risk 409 仅以 duplicate_result 恢复并复用真实 Flow ID', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockResolvedValue({ data: makeHTTPRecord({ id: 707 }) })
    createTestResultMock.mockRejectedValue(makeConflictError('duplicate_result', makeRiskRecord({ test_data_id: 707 })))
    const onSuccess = vi.fn()

    render(<ShareToTeamProjectModal visible prepared={riskShare} onCancel={vi.fn()} onSuccess={onSuccess} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  test.each([undefined, 'duplicate_data', 'version_conflict'])(
    'Risk 409 错误码为 %s 时拒绝复用外观匹配的记录',
    async (code) => {
      getMeMock.mockResolvedValue({ data: createCurrentUser() })
      createTestDataMock.mockResolvedValue({ data: makeHTTPRecord({ id: 707 }) })
      createTestResultMock.mockRejectedValue(makeConflictError(code, makeRiskRecord({ test_data_id: 707 })))
      const onSuccess = vi.fn()

      render(<ShareToTeamProjectModal visible prepared={riskShare} onCancel={vi.fn()} onSuccess={onSuccess} />)
      await screen.findByRole('option', { name: '蓝队项目' })
      fireEvent.click(screen.getByRole('button', { name: '分享' }))

      await screen.findByText('分享失败，请重试')
      expect(onSuccess).not.toHaveBeenCalled()
    },
  )

  test.each([
    [
      'HTTP 客户端身份',
      () =>
        ({
          kind: 'http-flow',
          http: { ...preparedHTTP, sourceClientId: 'other-client' },
        }) as PreparedTeamShare,
    ],
    [
      'HTTP 本地 ID',
      () =>
        ({
          kind: 'http-flow',
          http: { ...preparedHTTP, localFlowId: '102' },
        }) as PreparedTeamShare,
    ],
    [
      'HTTP 名称',
      () =>
        ({
          kind: 'http-flow',
          http: { ...preparedHTTP, name: '伪造名称' },
        }) as PreparedTeamShare,
    ],
    [
      'HTTP 摘要',
      () =>
        ({
          kind: 'http-flow',
          http: { ...preparedHTTP, summary: { ...preparedHTTP.summary, method: 'POST' } },
        }) as PreparedTeamShare,
    ],
    [
      'HTTP flow_key',
      () =>
        ({
          kind: 'http-flow',
          http: { ...preparedHTTP, flowKey: '0'.repeat(64) },
        }) as PreparedTeamShare,
    ],
    [
      'HTTP 正文哈希',
      () =>
        ({
          kind: 'http-flow',
          http: { ...preparedHTTP, contentHash: '0'.repeat(64) },
        }) as PreparedTeamShare,
    ],
    [
      'HTTP 请求摘要',
      () =>
        ({
          kind: 'http-flow',
          http: {
            ...preparedHTTP,
            request: { ...preparedHTTP.request, sha256: '0'.repeat(64) },
          },
        }) as PreparedTeamShare,
    ],
    [
      'Risk 本地 ID',
      () =>
        ({
          kind: 'risk',
          http: preparedHTTP,
          risk: { ...preparedRisk, localRiskId: '203' },
        }) as PreparedTeamShare,
    ],
    [
      'Risk risk_key',
      () =>
        ({
          kind: 'risk',
          http: preparedHTTP,
          risk: { ...preparedRisk, riskKey: '0'.repeat(64) },
        }) as PreparedTeamShare,
    ],
    [
      'Risk 正文哈希',
      () =>
        ({
          kind: 'risk',
          http: preparedHTTP,
          risk: { ...preparedRisk, contentHash: '0'.repeat(64) },
        }) as PreparedTeamShare,
    ],
    [
      'Risk 严重级别',
      () =>
        ({
          kind: 'risk',
          http: preparedHTTP,
          risk: { ...preparedRisk, summary: { ...preparedRisk.summary, severity: 'high' } },
        }) as PreparedTeamShare,
    ],
  ])('prepared 的%s可独立篡改时在任何写入前失败关闭', async (_name, createPrepared) => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    createTestDataMock.mockResolvedValue({ data: makeHTTPRecord() })
    createTestResultMock.mockResolvedValue({ data: makeRiskRecord() })

    render(<ShareToTeamProjectModal visible prepared={createPrepared()} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await screen.findByText('分享失败，请重试')
    expect(createTestDataMock).not.toHaveBeenCalled()
    expect(createTestResultMock).not.toHaveBeenCalled()
  })

  test('正文 Base64 损坏时在任何写入前失败关闭', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    const parsed = JSON.parse(preparedHTTP.content)
    parsed.request.raw_base64 = `${parsed.request.raw_base64} `
    const damaged: PreparedTeamShare = {
      kind: 'http-flow',
      http: {
        ...preparedHTTP,
        content: JSON.stringify(parsed),
      },
    }

    render(<ShareToTeamProjectModal visible prepared={damaged} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await screen.findByText('分享失败，请重试')
    expect(createTestDataMock).not.toHaveBeenCalled()
    expect(createTestResultMock).not.toHaveBeenCalled()
  })

  test('正文超过 20 MiB 时显示冻结提示且不执行任何写入', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    const oversized: PreparedTeamShare = {
      kind: 'http-flow',
      http: {
        ...preparedHTTP,
        content: 'x'.repeat(MAX_SHARED_RECORD_CONTENT_BYTES + 1),
      },
    }

    render(<ShareToTeamProjectModal visible prepared={oversized} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))

    await screen.findByText('该流量超过团队共享上限')
    expect(createTestDataMock).not.toHaveBeenCalled()
    expect(createTestResultMock).not.toHaveBeenCalled()
  })

  test('提交中的旧回调在认证切换后失效', async () => {
    const recheck = deferred<{ data: CurrentCollaborationUser }>()
    getMeMock.mockResolvedValueOnce({ data: createCurrentUser() }).mockReturnValueOnce(recheck.promise)
    const onSuccess = vi.fn()
    const view = render(
      <ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={onSuccess} />,
    )
    await screen.findByRole('option', { name: '蓝队项目' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))
    storeUserInfo = { isLogin: true, user_id: 8, token: 'token-b' }
    view.rerender(
      <ShareToTeamProjectModal visible={false} prepared={httpShare} onCancel={vi.fn()} onSuccess={onSuccess} />,
    )

    await act(async () => recheck.resolve({ data: createCurrentUser() }))
    expect(createTestDataMock).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  test('切换团队会使旧团队的提交响应失效', async () => {
    const recheck = deferred<{ data: CurrentCollaborationUser }>()
    const current = createCurrentUser(undefined, { secondTeam: true })
    getMeMock.mockResolvedValueOnce({ data: current }).mockReturnValueOnce(recheck.promise)

    render(<ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '红队' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))
    fireEvent.change(screen.getByRole('combobox', { name: '团队' }), { target: { value: '2' } })

    await act(async () => recheck.resolve({ data: current }))
    expect(createTestDataMock).not.toHaveBeenCalled()
  })

  test('权限或认证失效事件立即清空目标并失败关闭', async () => {
    getMeMock.mockResolvedValue({ data: createCurrentUser() })
    render(<ShareToTeamProjectModal visible prepared={httpShare} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '蓝队项目' })

    act(() => publishTeamPermissionInvalidation(1))
    expect(screen.getByRole('button', { name: '分享' })).toBeDisabled()

    act(() => publishTeamAuthenticationInvalidation())
    expect(screen.getByRole('button', { name: '分享' })).toBeDisabled()
  })

  test('HTTP 成功回调返回后若目标已切换，仍不继续写 Risk', async () => {
    const flowWrite = deferred<{ data: ReturnType<typeof makeHTTPRecord> }>()
    const current = createCurrentUser(undefined, { secondTeam: true })
    getMeMock.mockResolvedValue({ data: current })
    createTestDataMock.mockReturnValue(flowWrite.promise)

    render(<ShareToTeamProjectModal visible prepared={riskShare} onCancel={vi.fn()} onSuccess={vi.fn()} />)
    await screen.findByRole('option', { name: '红队' })
    fireEvent.click(screen.getByRole('button', { name: '分享' }))
    await waitFor(() => expect(createTestDataMock).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('combobox', { name: '团队' }), { target: { value: '2' } })
    await act(async () => flowWrite.resolve({ data: makeHTTPRecord() }))

    expect(createTestResultMock).not.toHaveBeenCalled()
  })
})
