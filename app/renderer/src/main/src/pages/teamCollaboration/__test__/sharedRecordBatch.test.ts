import { createHash } from 'crypto'
import { Buffer } from 'buffer'
import { runTeamRecordBatch, BatchShareOptions } from '../sharedRecordBatch'
import { readFullHTTPFlowBytes, parseSharedHTTPFlow, parseSharedRisk } from '../sharedRecordAdapters'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), axios: vi.fn(), setting: vi.fn() }))
vi.mock('@/utils/kv', () => ({ getRemoteValue: mocks.setting }))
vi.mock('@/utils/envfile', () => ({ getRemoteHttpSettingGV: () => 'team-setting', globalUserLogout: vi.fn() }))
vi.mock('@/utils/login', () => ({ loginOutLocal: vi.fn() }))
vi.mock('@/utils/notification', () => ({ failed: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ default: { getFixedT: () => (key: string) => key } }))
vi.mock('@/services/electronBridge', () => ({ yakitNetwork: { axiosApi: mocks.axios, logoutDynamicControl: vi.fn() } }))

let flows: number[]
let risks: number[]
let riskPairs: Record<number, number[]>
let currentProject: number
let options: BatchShareOptions
let controller: AbortController
let records: Map<string, any>
let results: Map<string, any>
const packet = (id: number, request: boolean) =>
  new TextEncoder().encode(
    request
      ? `POST /真实/${id} HTTP/1.1\r\nHost: example.test\r\n\r\n${'完整请求'.repeat(1000)}`
      : `HTTP/1.1 200 OK\r\n\r\n${'完整响应'.repeat(1000)}`,
  )
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const sha = (content: string) => createHash('sha256').update(content).digest('hex')
const freshUser = () => ({
  user: { id: 7, status: 'active' },
  memberships: [
    {
      member: { user_id: 7, team_id: 1, version: 1, status: 'active' },
      team: { id: 1, name: '团队', status: 'active' },
      permissions: ['test_data.write', 'test_result.write'],
      projects: [{ id: 10, team_id: 1, name: '团队项目', status: 'active' }],
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  flows = [101, 102]
  risks = [201]
  riskPairs = { 201: [101] }
  currentProject = 77
  records = new Map()
  results = new Map()
  controller = new AbortController()
  options = {
    localProjectId: 77,
    projectType: 'project',
    kinds: ['http-flow', 'risk'],
    target: {
      teamId: 1,
      projectId: 10,
      userId: 7,
      request: { diyHome: 'https://team.example.test', headers: { Authorization: 'token-a' } },
    },
    signal: controller.signal,
    isCurrent: () => true,
    onProgress: vi.fn(),
  }
  mocks.setting.mockResolvedValue(JSON.stringify({ BaseUrl: 'https://team.example.test' }))
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: { invoke: mocks.invoke } }),
  })
  mocks.invoke.mockImplementation(async (channel, input) => {
    if (channel === 'GetCurrentProjectEx') return { Id: currentProject }
    if (channel === 'GetCollaborationClientID') return 'client-a'
    if (channel === 'EncodeHTTPPacketContent') return { EncodedText: b64(packet(input.HTTPFlowId, input.IsRequest)) }
    if (channel === 'GetHTTPFlowById')
      return {
        Id: input.Id,
        CreatedAt: 1780000000,
        Method: 'POST',
        Url: `https://example.test/真实/${input.Id}`,
        HostPort: 'example.test',
        StatusCode: 200,
        Request: 'TRUNCATED',
      }
    if (channel === 'QueryRisks' && input.Ids)
      return {
        Data: input.Ids.map((id: number) => ({
          Id: id,
          Title: `漏洞 ${id}`,
          Severity: 'high',
          RiskType: 'xss',
          Details: '完整内容'.repeat(1500),
          PacketPairs: (riskPairs[id] || []).map((HttpflowId) => ({ HttpflowId })),
        })),
      }
    if (channel === 'QueryHTTPFlows' || channel === 'QueryRisks') {
      const ids = channel === 'QueryHTTPFlows' ? flows : risks
      const { Page, Limit } = input.Pagination
      return { Total: ids.length, Data: ids.slice((Page - 1) * Limit, Page * Limit).map((Id) => ({ Id })) }
    }
    throw new Error(`unexpected ${channel}`)
  })
  mocks.axios.mockImplementation(async ({ url, data, method }) => {
    if (url === 'v2/me') return { code: 200, data: { ok: true, data: freshUser() } }
    if (method !== 'post') throw new Error('unexpected method')
    const isRisk = url.endsWith('/test-results')
    const map = isRisk ? results : records
    const duplicate = map.get(data.deduplication_key)
    if (duplicate)
      return {
        code: 409,
        data: {
          ok: false,
          data: duplicate,
          error: { code: isRisk ? 'duplicate_result' : 'duplicate_data', message: '重复记录' },
        },
      }
    const record = {
      ...data,
      id: 1000 + map.size,
      team_id: 1,
      project_id: 10,
      content_hash: sha(data.content),
      status: 'active',
      ...(isRisk ? { result_type: data.type } : { data_type: data.type }),
    }
    map.set(data.deduplication_key, record)
    return { code: 201, data: { ok: true, data: record } }
  })
})

test('真实 service/fetch 请求保存两条完整报文和唯一关联漏洞，重复执行数量不增加', async () => {
  expect(await runTeamRecordBatch(options)).toMatchObject({
    total: 3,
    success: 3,
    duplicate: 0,
    failures: [],
    pending: [],
    stoppedReason: '',
  })
  expect(records.size).toBe(2)
  expect(results.size).toBe(1)
  const http = [...records.values()][0]
  const risk = [...results.values()][0]
  expect(risk.test_data_id).toBe(http.id)
  expect(Array.from((await parseSharedHTTPFlow(http.content)).request)).toEqual(Array.from(packet(101, true)))
  expect(Array.from((await parseSharedHTTPFlow(http.content)).response)).toEqual(Array.from(packet(101, false)))
  expect(new TextDecoder().decode((await parseSharedRisk(risk.content)).payload)).toContain('完整内容'.repeat(1500))
  expect(http.metadata).toEqual({
    method: 'POST',
    url: 'https://example.test/真实/101',
    host: 'example.test',
    status_code: 200,
  })
  expect(risk.metadata.title).toBe('漏洞 201')
  expect(mocks.axios).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'post',
      url: 'v2/teams/1/projects/10/test-results',
      diyHome: 'https://team.example.test',
      headers: { Authorization: 'token-a' },
      data: expect.objectContaining({ type: 'risk', test_data_id: http.id }),
    }),
  )
  expect(await runTeamRecordBatch(options)).toMatchObject({ success: 0, duplicate: 3, failures: [] })
  expect(records.size).toBe(2)
  expect(results.size).toBe(1)
})

test('按现有分页跨三页读取完整范围且只保留 ID 队列', async () => {
  flows = Array.from({ length: 205 }, (_, i) => i + 1)
  options.kinds = ['http-flow']
  expect(await runTeamRecordBatch(options)).toMatchObject({ total: 205, success: 205, failures: [] })
  expect(
    mocks.invoke.mock.calls
      .filter(([channel]) => channel === 'QueryHTTPFlows')
      .map(([, input]) => input.Pagination.Page),
  ).toEqual([1, 2, 3])
  expect(records.size).toBe(205)
})

test('部分失败仅重试失败 ID，复用已确认流量 ID 后补传漏洞', async () => {
  const transport = mocks.axios.getMockImplementation()!
  let fail = true
  mocks.axios.mockImplementation(async (request) =>
    request.url.endsWith('/test-results') && fail
      ? { code: 500, data: { error: { code: 'temporary', message: '暂时失败' } } }
      : transport(request),
  )
  const first = await runTeamRecordBatch(options)
  expect(first).toMatchObject({ success: 2, duplicate: 0, failures: [{ kind: 'risk', id: 201 }] })
  fail = false
  const retry = await runTeamRecordBatch({ ...options, retryItems: first.failures })
  expect(retry).toMatchObject({ total: 1, success: 1, failures: [] })
  expect(records.size).toBe(2)
  expect([...results.values()][0].test_data_id).toBe([...records.values()][0].id)
})

test('缺少或多个关联的漏洞明确失败且不伪造流量', async () => {
  risks = [201, 202, 203]
  riskPairs = { 201: [], 202: [101, 102], 203: [101] }
  const result = await runTeamRecordBatch({ ...options, kinds: ['risk'] })
  expect(result).toMatchObject({ success: 1, failures: [{ id: 201 }, { id: 202 }] })
  expect(result.failures[0].message).toContain('未关联')
  expect(result.failures[1].message).toContain('多个')
  expect(records.size).toBe(1)
})

test('所选项目与引擎不一致时不查询或提交记录', async () => {
  currentProject = 88
  expect((await runTeamRecordBatch(options)).stoppedReason).toContain('不一致')
  expect(mocks.axios).not.toHaveBeenCalled()
  expect(mocks.invoke.mock.calls.every(([channel]) => channel === 'GetCurrentProjectEx')).toBe(true)
})

test.each(['account', 'team', 'project', 'server', 'engine', 'cancel'])(
  '准备完整报文时切换 %s 停止旧任务',
  async (change) => {
    const engine = mocks.invoke.getMockImplementation()!
    mocks.invoke.mockImplementation(async (channel, input) => {
      const result = await engine(channel, input)
      if (channel === 'EncodeHTTPPacketContent') {
        if (change === 'cancel') controller.abort()
        else if (change === 'engine') currentProject = 88
        else if (change === 'server') mocks.setting.mockResolvedValue(JSON.stringify({ BaseUrl: 'https://other.test' }))
        else options.isCurrent = () => false
      }
      return result
    })
    const result = await runTeamRecordBatch(options)
    expect(result.success).toBe(0)
    expect(result.pending).toHaveLength(3)
    expect(result.stoppedReason).not.toBe('')
    expect(mocks.axios).not.toHaveBeenCalled()
  },
)

test('漏洞流量提交后取消，不再发送漏洞；继续任务依靠去重恢复关联', async () => {
  const transport = mocks.axios.getMockImplementation()!
  mocks.axios.mockImplementation(async (request) => {
    const response = await transport(request)
    if (request.url.endsWith('/test-data')) controller.abort()
    return response
  })
  const first = await runTeamRecordBatch({ ...options, kinds: ['risk'] })
  expect(first).toMatchObject({ success: 0, duplicate: 0, pending: [{ kind: 'risk', id: 201 }] })
  expect(records.size).toBe(1)
  expect(results.size).toBe(0)
  mocks.axios.mockImplementation(transport)
  expect(
    await runTeamRecordBatch({
      ...options,
      kinds: ['risk'],
      signal: new AbortController().signal,
      retryItems: first.pending,
    }),
  ).toMatchObject({ success: 1, failures: [] })
  expect(records.size).toBe(1)
})

test('服务端未确认或返回错误目标 ID 不算成功', async () => {
  const transport = mocks.axios.getMockImplementation()!
  mocks.axios.mockImplementation(async (request) => {
    const response = await transport(request)
    if (request.url.endsWith('/test-data')) response.data.data.project_id = 999
    return response
  })
  expect(await runTeamRecordBatch(options)).toMatchObject({
    success: 0,
    duplicate: 0,
    failures: [{ id: 101 }, { id: 102 }, { id: 201 }],
  })
})

test('分页数量漂移时终止，尚未发送任何业务记录', async () => {
  flows = Array.from({ length: 101 }, (_, i) => i + 1)
  const engine = mocks.invoke.getMockImplementation()!
  mocks.invoke.mockImplementation(async (channel, input) => {
    const response = await engine(channel, input)
    if (channel === 'QueryHTTPFlows' && input.Pagination.Page === 2) response.Total += 1
    return response
  })
  expect((await runTeamRecordBatch(options)).stoppedReason).toContain('数量')
  expect(mocks.axios).not.toHaveBeenCalled()
})

test('完整字节夹具直读', async () => {
  const raw = await mocks.invoke('EncodeHTTPPacketContent', { HTTPFlowId: 101, IsRequest: true })
  expect(raw.EncodedText).toBe(b64(packet(101, true)))
  expect(Array.from((await readFullHTTPFlowBytes(101, mocks.invoke)).request)).toEqual(Array.from(packet(101, true)))
})
