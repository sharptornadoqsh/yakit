import {
  MAX_SHARED_RECORD_CONTENT_BYTES,
  assertSharedRecordContentSize,
  createSharedBytesPayload,
  decodeAndVerifyBytes,
  decodeBase64Strict,
  encodeBytes,
  encodeBase64,
  sha256Hex,
  verifySharedBytesPayload,
} from '../binaryPayload'
import {
  createSharedHTTPFlowPayload,
  createSharedRiskPayload,
  getCollaborationClientID,
  parseSharedHTTPFlowPayload,
  parseSharedHTTPFlow,
  parseSharedRiskPayload,
  parseSharedRisk,
  prepareSharedHTTPFlow,
  prepareSharedRisk,
  readFullHTTPFlowBytes,
  resolveShareableRiskHTTPFlowId,
  resolveRiskHTTPFlowID,
  serializeSharedRisk,
  stableSerializeRiskPayload,
} from '../sharedRecordAdapters'

const REQUEST_BASE64 = 'R0VUIC9oZWFsdGggSFRUUC8xLjENCkhvc3Q6IGV4YW1wbGUudGVzdA0KDQo='
const RESPONSE_BASE64 = 'SFRUUC8xLjEgMjAwIE9LDQpDb250ZW50LUxlbmd0aDogMg0KDQpPSw=='
const REQUEST_SHA256 = 'e10edfa8f537edd8639c77e258adc0f9573645e07f6e5f8be4b9bf9a6475be82'
const RESPONSE_SHA256 = '3a276ae58952a3953a2871eb64e8f585b30c7b4732835c5a6d61422691f492b2'
const FLOW_KEY = '4ccfa3deea2e488513a6fde5fb05cb69a1e09c56e946ad4ea5e12b2bca51403b'
const RISK_PAYLOAD_SHA256 = 'b073c5e117122ab069a1d77ed77b4fed7a663d1fc0364accf7235857c567b339'
const RISK_KEY = '86104db0922c4bd2c4f56d68943bcf15f0bbc9cdb19fdf92c7d5160298d5e5f8'

const expectErrorCode = async (operation: Promise<unknown> | (() => unknown), code: string) => {
  try {
    if (typeof operation === 'function') {
      await operation()
    } else {
      await operation
    }
    throw new Error('预期操作失败')
  } catch (error) {
    expect(error).toMatchObject({ code })
  }
}

describe('共享记录二进制载荷', () => {
  test('严格 Base64 往返支持空内容与二进制内容', () => {
    expect(encodeBase64(new Uint8Array())).toBe('')
    expect(decodeBase64Strict('')).toEqual(new Uint8Array())
    expect(encodeBase64(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe('AAEC/f7/')
    expect(decodeBase64Strict('AAEC/f7/')).toEqual(new Uint8Array([0, 1, 2, 253, 254, 255]))
    expect(encodeBytes(new Uint8Array([0, 1, 2, 253, 254, 255]))).toBe('AAEC/f7/')
  })

  test.each([' Zg==', 'Zg==\n', 'Zg', 'Zg===', 'Zg-_', 'AB==', 'A==='])('拒绝非规范 Base64：%s', (value) => {
    expect(() => decodeBase64Strict(value)).toThrow()
  })

  test('生成并校验长度、哈希与内容', async () => {
    const payload = await createSharedBytesPayload(new Uint8Array([1, 2, 3]))
    expect(payload).toEqual({
      raw_base64: 'AQID',
      byte_length: 3,
      sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    })
    await expect(verifySharedBytesPayload(payload)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await expect(decodeAndVerifyBytes(payload.raw_base64, payload.byte_length, payload.sha256)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    )
    await expect(verifySharedBytesPayload({ ...payload, byte_length: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow()
    await expect(verifySharedBytesPayload({ ...payload, sha256: payload.sha256.toUpperCase() })).rejects.toThrow()
    await expect(verifySharedBytesPayload({ ...payload, byte_length: 2 })).rejects.toThrow()
    await expect(verifySharedBytesPayload({ ...payload, sha256: '0'.repeat(64) })).rejects.toThrow()
  })

  test('SHA-256 不依赖巨型数组展开', async () => {
    await expect(sha256Hex(new Uint8Array([1, 2, 3]))).resolves.toBe(
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    )
  })

  test('UTF-8 正文大小在 20 MiB 边界精确通过，超一字节稳定失败', async () => {
    expect(() => assertSharedRecordContentSize('a'.repeat(MAX_SHARED_RECORD_CONTENT_BYTES))).not.toThrow()
    await expectErrorCode(
      () => assertSharedRecordContentSize(`${'a'.repeat(MAX_SHARED_RECORD_CONTENT_BYTES)}b`),
      'shared_record_payload_too_large',
    )
    await expectErrorCode(
      () => assertSharedRecordContentSize(`${'a'.repeat(MAX_SHARED_RECORD_CONTENT_BYTES - 2)}界`),
      'shared_record_payload_too_large',
    )
  })
})

describe('HTTP 流量完整字节读取', () => {
  test('只调用两次 EncodeHTTPPacketContent 并返回完整请求与响应字节', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ EncodedText: REQUEST_BASE64 })
      .mockResolvedValueOnce({ EncodedText: RESPONSE_BASE64 })

    await expect(readFullHTTPFlowBytes(101, invoke)).resolves.toEqual({
      request: decodeBase64Strict(REQUEST_BASE64),
      response: decodeBase64Strict(RESPONSE_BASE64),
    })
    expect(invoke.mock.calls).toEqual([
      ['EncodeHTTPPacketContent', { HTTPFlowId: 101, IsRequest: true, Position: 'all', EncodingType: 'base64' }],
      ['EncodeHTTPPacketContent', { HTTPFlowId: 101, IsRequest: false, Position: 'all', EncodingType: 'base64' }],
    ])
  })

  test('空请求和空响应是合法的完整原始字节', async () => {
    const invoke = vi.fn().mockResolvedValue({ EncodedText: '' })
    await expect(readFullHTTPFlowBytes(1, invoke)).resolves.toEqual({
      request: new Uint8Array(),
      response: new Uint8Array(),
    })
  })

  test.each([
    [{ Error: '编码失败' }, { EncodedText: '' }],
    [{ Error: '编码失败', EncodedText: REQUEST_BASE64 }, { EncodedText: '' }],
    [{ EncodedText: '' }, { TooLarge: true, FilePath: 'C:\\secret' }],
    [{ EncodedText: 'Zg' }, { EncodedText: '' }],
    [new Error('ipc failed'), { EncodedText: '' }],
  ])('任一完整报文不可用时失败关闭且错误码稳定', async (first, second) => {
    const invoke = vi.fn()
    if (first instanceof Error) {
      invoke.mockRejectedValueOnce(first)
    } else {
      invoke.mockResolvedValueOnce(first)
    }
    invoke.mockResolvedValueOnce(second)
    await expectErrorCode(readFullHTTPFlowBytes(101, invoke), 'http_flow_raw_bytes_unavailable')
  })

  test('不会读取预览、路径或其他回退字段', async () => {
    const toxic = {}
    for (const key of ['Request', 'Response', 'Preview', 'FilePath', 'Path']) {
      Object.defineProperty(toxic, key, {
        enumerable: true,
        get: () => {
          throw new Error(`不应读取 ${key}`)
        },
      })
    }
    Object.defineProperty(toxic, 'EncodedText', { enumerable: true, value: '' })
    const invoke = vi.fn().mockResolvedValue(toxic)

    await expect(readFullHTTPFlowBytes(1, invoke)).resolves.toEqual({
      request: new Uint8Array(),
      response: new Uint8Array(),
    })
  })
})

describe('共享 HTTP Flow 与 Risk 契约', () => {
  test('客户端标识仅通过无参数 Main IPC 获取', async () => {
    const invoke = vi.fn().mockResolvedValue('http-client-a')
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    const randomUUIDDescriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('不应读取 localStorage')
      },
    })
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        throw new Error('不应生成 Renderer 身份')
      },
    })

    try {
      await expect(getCollaborationClientID(invoke)).resolves.toBe('http-client-a')
      expect(invoke).toHaveBeenCalledWith('GetCollaborationClientID')
    } finally {
      if (localStorageDescriptor) Object.defineProperty(window, 'localStorage', localStorageDescriptor)
      if (randomUUIDDescriptor) Object.defineProperty(globalThis.crypto, 'randomUUID', randomUUIDDescriptor)
    }
  })

  test('固定 HTTP Flow 向量得到精确 JSON、flow_key 与 content hash', async () => {
    const prepared = await prepareSharedHTTPFlow({
      clientId: 'http-client-a',
      localFlowId: '101',
      capturedAt: '2026-07-30T08:00:00.123456789Z',
      request: decodeBase64Strict(REQUEST_BASE64),
      response: decodeBase64Strict(RESPONSE_BASE64),
      summary: {
        method: 'GET',
        url: 'https://example.test/health',
        host: 'example.test',
        status_code: 200,
      },
    })

    expect(prepared.flowKey).toBe(FLOW_KEY)
    expect(prepared.name).toBe('HTTP Flow 101')
    expect(prepared.content).toBe(
      `{"schema":"yakit.shared-http-flow/v1","flow_key":"${FLOW_KEY}","captured_at":"2026-07-30T08:00:00.123456789Z","request":{"raw_base64":"${REQUEST_BASE64}","byte_length":44,"sha256":"${REQUEST_SHA256}"},"response":{"raw_base64":"${RESPONSE_BASE64}","byte_length":40,"sha256":"${RESPONSE_SHA256}"},"summary":{"method":"GET","url":"https://example.test/health","host":"example.test","status_code":200}}`,
    )
    expect(prepared.contentHash).toBe('a14b49ab87d98d9a7ff51cd3aaf9805b399807e46b3fc09d3910b2c7ca4af70d')
    await expect(parseSharedHTTPFlowPayload(prepared.content)).resolves.toMatchObject({ flowKey: FLOW_KEY })
    await expect(parseSharedHTTPFlow(prepared.content)).resolves.toMatchObject({ flowKey: FLOW_KEY })
  })

  test('固定 Risk 向量得到精确 JSON、risk_key 与 content hash', async () => {
    const prepared = await prepareSharedRisk({
      clientId: 'http-client-a',
      localRiskId: '202',
      flowKey: FLOW_KEY,
      payload: new TextEncoder().encode('{"evidence":"safe fixture"}'),
      summary: {
        title: 'safe fixture risk',
        severity: 'low',
        risk_type: 'fixture',
      },
    })

    expect(prepared.riskKey).toBe(RISK_KEY)
    expect(prepared.name).toBe('Risk 202')
    expect(prepared.payload.sha256).toBe(RISK_PAYLOAD_SHA256)
    expect(prepared.content).toBe(
      `{"schema":"yakit.shared-risk/v1","risk_key":"${RISK_KEY}","flow_key":"${FLOW_KEY}","payload":{"raw_base64":"eyJldmlkZW5jZSI6InNhZmUgZml4dHVyZSJ9","byte_length":27,"sha256":"${RISK_PAYLOAD_SHA256}"},"summary":{"title":"safe fixture risk","severity":"low","risk_type":"fixture"}}`,
    )
    expect(prepared.contentHash).toBe('df047cc0c5c2821bcda4a664f7ef517ec817ad69fe5269e2188433137fe2d2b0')
    await expect(parseSharedRiskPayload(prepared.content)).resolves.toMatchObject({
      riskKey: RISK_KEY,
      flowKey: FLOW_KEY,
    })
    await expect(parseSharedRisk(prepared.content)).resolves.toMatchObject({ riskKey: RISK_KEY })
  })

  test('Risk 必须精确关联一个有效 HTTP Flow', () => {
    expect(resolveShareableRiskHTTPFlowId({ PacketPairs: [{ HttpflowId: 101 }] } as never)).toBe(101)
    expect(resolveShareableRiskHTTPFlowId({ PacketPairs: [{ HttpflowId: 101 }, { HttpflowId: 101 }] } as never)).toBe(
      101,
    )
    expect(() => resolveShareableRiskHTTPFlowId({ PacketPairs: [] } as never)).toThrowError(
      expect.objectContaining({ code: 'risk_flow_not_linked' }),
    )
    expect(() =>
      resolveShareableRiskHTTPFlowId({ PacketPairs: [{ HttpflowId: 1 }, { HttpflowId: 2 }] } as never),
    ).toThrowError(expect.objectContaining({ code: 'risk_flow_ambiguous' }))
    expect(() => resolveShareableRiskHTTPFlowId({ PacketPairs: [{ HttpflowId: 0 }] } as never)).toThrow()
    expect(() => resolveRiskHTTPFlowID({ PacketPairs: [{ HttpflowId: '101' }] })).toThrow()
  })

  test('Risk 关联解析不会读取报文预览字段', () => {
    const pair = { HttpflowId: 101 }
    for (const key of ['Request', 'Response', 'Url']) {
      Object.defineProperty(pair, key, {
        get: () => {
          throw new Error(`不应读取 ${key}`)
        },
      })
    }
    expect(resolveRiskHTTPFlowID({ PacketPairs: [pair] })).toBe(101)
  })
})

describe('Risk 确定性序列化', () => {
  test('对象键按 Unicode 码点排序而数组保持原顺序', async () => {
    await expect(stableSerializeRiskPayload({ '\u{10000}': 2, '\uE000': 1, list: [3, 2, 1] })).resolves.toBe(
      '{"list":[3,2,1],"":1,"𐀀":2}',
    )
  })

  test('冻结接口 serializeSharedRisk 返回确定性 UTF-8 字节', async () => {
    await expect(serializeSharedRisk({ Details: { '\u{10000}': 2, '\uE000': 1 } } as never)).resolves.toEqual(
      new TextEncoder().encode('{"Details":{"":1,"𐀀":2}}'),
    )
  })

  test('对象 undefined 省略，数组 undefined 和空槽转换为 null，共享引用合法', async () => {
    const shared = { value: 1 }
    const sparse = [undefined, undefined, shared]
    delete sparse[1]
    await expect(
      stableSerializeRiskPayload({
        omitted: undefined,
        left: shared,
        right: shared,
        sparse,
      }),
    ).resolves.toBe('{"left":{"value":1},"right":{"value":1},"sparse":[null,null,{"value":1}]}')
  })

  test('ArrayBufferView 只序列化视图范围的字节描述符', async () => {
    const source = new Uint8Array([1, 2, 3, 4])
    const view = new DataView(source.buffer, 1, 2)
    await expect(stableSerializeRiskPayload({ view })).resolves.toBe(
      '{"view":{"raw_base64":"AgM=","byte_length":2,"sha256":"ee9040f65c341855e070ff438eb0ea9d5b831b2a2c270fb7ef592d750408e3b3"}}',
    )
  })

  test.each([
    new ArrayBuffer(1),
    new Date(),
    new Map(),
    BigInt(1),
    () => undefined,
    Symbol('invalid'),
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('拒绝不受支持的值 %#', async (value) => {
    await expect(stableSerializeRiskPayload({ value })).rejects.toThrow()
  })

  test('拒绝循环引用但允许同一对象出现在不同分支', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    await expect(stableSerializeRiskPayload(cyclic)).rejects.toThrow()
  })
})

describe('共享记录严格解析', () => {
  test('拒绝错误 schema、时间、摘要、键、Base64、长度、哈希与超限正文', async () => {
    const prepared = await prepareSharedHTTPFlow({
      clientId: 'http-client-a',
      localFlowId: '101',
      capturedAt: '2026-07-30T08:00:00.123456789Z',
      request: decodeBase64Strict(REQUEST_BASE64),
      response: decodeBase64Strict(RESPONSE_BASE64),
      summary: {
        method: 'GET',
        url: 'https://example.test/health',
        host: 'example.test',
        status_code: 200,
      },
    })
    const base = JSON.parse(prepared.content)
    const invalidValues = [
      { ...base, schema: 'wrong' },
      { ...base, captured_at: '2026-07-30' },
      { ...base, captured_at: '2026-02-30T00:00:00Z' },
      { ...base, flow_key: base.flow_key.toUpperCase() },
      { ...base, summary: { ...base.summary, status_code: -1 } },
      { ...base, request: { ...base.request, raw_base64: 'Zg' } },
      { ...base, request: { ...base.request, byte_length: -1 } },
      { ...base, request: { ...base.request, sha256: '0'.repeat(64) } },
    ]

    for (const value of invalidValues) {
      await expect(parseSharedHTTPFlow(JSON.stringify(value))).rejects.toThrow()
    }
    await expectErrorCode(
      parseSharedHTTPFlow(`"${'a'.repeat(MAX_SHARED_RECORD_CONTENT_BYTES)}"`),
      'shared_record_payload_too_large',
    )
  })

  test('冻结 create API 要求无前导零十进制字符串 ID', async () => {
    const request = decodeBase64Strict(REQUEST_BASE64)
    const response = decodeBase64Strict(RESPONSE_BASE64)
    const flow = await createSharedHTTPFlowPayload({
      clientId: 'http-client-a',
      localFlowId: '101',
      capturedAt: '2026-07-30T08:00:00.123456789Z',
      request,
      response,
      summary: {
        method: 'GET',
        url: 'https://example.test/health',
        host: 'example.test',
        status_code: 200,
      },
    })
    expect(flow.flow_key).toBe(FLOW_KEY)
    await expect(
      createSharedHTTPFlowPayload({
        clientId: 'http-client-a',
        localFlowId: '0101',
        capturedAt: '2026-07-30T08:00:00Z',
        request,
        response,
        summary: { method: 'GET', url: 'https://example.test', host: 'example.test', status_code: 200 },
      }),
    ).rejects.toThrow()
    const risk = await createSharedRiskPayload({
      clientId: 'http-client-a',
      localRiskId: '202',
      flowKey: FLOW_KEY,
      payload: new TextEncoder().encode('{"evidence":"safe fixture"}'),
      summary: { title: 'safe fixture risk', severity: 'low', risk_type: 'fixture' },
    })
    expect(risk.risk_key).toBe(RISK_KEY)
  })
})
