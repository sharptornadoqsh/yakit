import type { Risk } from '@/pages/risks/schema'
import {
  SharedBytesPayload,
  SharedRecordError,
  assertSharedRecordContentSize,
  createSharedBytesPayload,
  decodeBase64Strict,
  sha256Hex,
  verifySharedBytesPayload,
} from './binaryPayload'

export const SHARED_HTTP_FLOW_SCHEMA = 'yakit.shared-http-flow/v1'
export const SHARED_RISK_SCHEMA = 'yakit.shared-risk/v1'

const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const RFC3339_NANO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/
const LOCAL_ID_PATTERN = /^[1-9][0-9]*$/

type IPCInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>

export interface SharedHTTPFlowSummary {
  method: string
  url: string
  host: string
  status_code: number
}

export interface SharedRiskSummary {
  title: string
  severity: string
  risk_type: string
}

export interface SharedHTTPFlowInput {
  clientId: string
  localFlowId: string
  capturedAt: string
  request: Uint8Array
  response: Uint8Array
  summary: SharedHTTPFlowSummary
}

export interface SharedRiskInput {
  clientId: string
  localRiskId: string
  flowKey: string
  payload: Uint8Array
  summary: SharedRiskSummary
}

export interface SharedHTTPFlowPayload {
  schema: typeof SHARED_HTTP_FLOW_SCHEMA
  flow_key: string
  captured_at: string
  request: SharedBytesPayload
  response: SharedBytesPayload
  summary: SharedHTTPFlowSummary
}

export interface SharedRiskPayload {
  schema: typeof SHARED_RISK_SCHEMA
  risk_key: string
  flow_key: string
  payload: SharedBytesPayload
  summary: SharedRiskSummary
}

export interface PreparedSharedHTTPFlow {
  sourceClientId: string
  localFlowId: string
  flowKey: string
  content: string
  contentHash: string
  name: string
  request: SharedBytesPayload
  response: SharedBytesPayload
  summary: SharedHTTPFlowSummary
}

export interface PreparedSharedRisk {
  sourceClientId: string
  localRiskId: string
  riskKey: string
  flowKey: string
  content: string
  contentHash: string
  name: string
  payload: SharedBytesPayload
  summary: SharedRiskSummary
}

export type PreparedTeamShare =
  | { kind: 'http-flow'; http: PreparedSharedHTTPFlow }
  | { kind: 'risk'; http: PreparedSharedHTTPFlow; risk: PreparedSharedRisk }

export interface ParsedSharedHTTPFlow {
  flowKey: string
  capturedAt: string
  request: Uint8Array
  response: Uint8Array
  summary: SharedHTTPFlowSummary
}

export interface ParsedSharedRisk {
  riskKey: string
  flowKey: string
  payload: Uint8Array
  summary: SharedRiskSummary
}

const defaultInvoke: IPCInvoke = (channel, ...args) => {
  const { ipcRenderer } = window.require('electron')
  return ipcRenderer.invoke(channel, ...args)
}

const invalidRecord = (message: string): never => {
  throw new SharedRecordError('invalid_shared_record', message)
}

const requirePositiveSafeInteger = (value: unknown, message: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalidRecord(message)
  return value
}

const requireLocalID = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || !LOCAL_ID_PATTERN.test(value)) return invalidRecord(message)
  return value
}

const requireSHA256 = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) return invalidRecord(message)
  return value
}

const requireClientID = (value: unknown): string => {
  if (typeof value !== 'string' || !CLIENT_ID_PATTERN.test(value)) {
    throw new SharedRecordError('invalid_collaboration_client_id', '团队协作客户端标识无效')
  }
  return value
}

const requireUint8Array = (value: unknown, message: string): Uint8Array => {
  if (Object.prototype.toString.call(value) !== '[object Uint8Array]') return invalidRecord(message)
  return value as Uint8Array
}

const asPlainRecord = (value: unknown, message: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidRecord(message)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) invalidRecord(message)
  return value as Record<string, unknown>
}

const requireExactKeys = (record: Record<string, unknown>, expected: string[], message: string) => {
  const keys = Object.keys(record)
  if (keys.length !== expected.length || expected.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    invalidRecord(message)
  }
}

const validateRFC3339Nano = (value: unknown): string => {
  if (typeof value !== 'string') return invalidRecord('共享 HTTP Flow 捕获时间无效')
  const match = RFC3339_NANO_PATTERN.exec(value)
  if (!match) return invalidRecord('共享 HTTP Flow 捕获时间无效')
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, zoneHour, zoneMinute] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (zone !== 'Z' && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return invalidRecord('共享 HTTP Flow 捕获时间无效')
  }
  return value
}

const validateHTTPFlowSummary = (value: unknown): SharedHTTPFlowSummary => {
  const summary = asPlainRecord(value, '共享 HTTP Flow 摘要无效')
  requireExactKeys(summary, ['method', 'url', 'host', 'status_code'], '共享 HTTP Flow 摘要无效')
  if (
    typeof summary.method !== 'string' ||
    !summary.method ||
    typeof summary.url !== 'string' ||
    !summary.url ||
    typeof summary.host !== 'string' ||
    typeof summary.status_code !== 'number' ||
    !Number.isSafeInteger(summary.status_code) ||
    summary.status_code < 0 ||
    summary.status_code > 999
  ) {
    return invalidRecord('共享 HTTP Flow 摘要无效')
  }
  return {
    method: summary.method,
    url: summary.url,
    host: summary.host,
    status_code: summary.status_code,
  }
}

const validateRiskSummary = (value: unknown): SharedRiskSummary => {
  const summary = asPlainRecord(value, '共享 Risk 摘要无效')
  requireExactKeys(summary, ['title', 'severity', 'risk_type'], '共享 Risk 摘要无效')
  if (
    typeof summary.title !== 'string' ||
    !summary.title ||
    typeof summary.severity !== 'string' ||
    !summary.severity ||
    typeof summary.risk_type !== 'string' ||
    !summary.risk_type
  ) {
    return invalidRecord('共享 Risk 摘要无效')
  }
  return {
    title: summary.title,
    severity: summary.severity,
    risk_type: summary.risk_type,
  }
}

const utf8 = (value: string) => new TextEncoder().encode(value)

const hashKeyParts = (parts: Array<string | number>) => sha256Hex(utf8(parts.map(String).join('\u0000')))

export const getCollaborationClientID = async (invoke: IPCInvoke = defaultInvoke): Promise<string> =>
  requireClientID(await invoke('GetCollaborationClientID'))

export const readFullHTTPFlowBytes = async (
  localFlowId: number,
  invoke: IPCInvoke = defaultInvoke,
): Promise<{ request: Uint8Array; response: Uint8Array }> => {
  requirePositiveSafeInteger(localFlowId, '本地 HTTP Flow 标识无效')
  try {
    const requestInput = {
      HTTPFlowId: localFlowId,
      IsRequest: true,
      Position: 'all',
      EncodingType: 'base64',
    }
    const responseInput = {
      HTTPFlowId: localFlowId,
      IsRequest: false,
      Position: 'all',
      EncodingType: 'base64',
    }
    const [requestResult, responseResult] = await Promise.all([
      Promise.resolve().then(() => invoke('EncodeHTTPPacketContent', requestInput)),
      Promise.resolve().then(() => invoke('EncodeHTTPPacketContent', responseInput)),
    ])
    const request = requestResult as { EncodedText?: unknown; Error?: unknown }
    const response = responseResult as { EncodedText?: unknown; Error?: unknown }
    if (
      (request?.Error !== undefined && request.Error !== null && request.Error !== '') ||
      (response?.Error !== undefined && response.Error !== null && response.Error !== '')
    ) {
      throw new Error()
    }
    const requestEncoded = request?.EncodedText
    const responseEncoded = response?.EncodedText
    if (typeof requestEncoded !== 'string' || typeof responseEncoded !== 'string') throw new Error()
    return {
      request: decodeBase64Strict(requestEncoded),
      response: decodeBase64Strict(responseEncoded),
    }
  } catch {
    throw new SharedRecordError('http_flow_raw_bytes_unavailable', '无法读取完整 HTTP 请求与响应原始字节')
  }
}

export const createSharedHTTPFlowPayload = async (input: SharedHTTPFlowInput): Promise<SharedHTTPFlowPayload> => {
  const clientId = requireClientID(input.clientId)
  const localFlowId = requireLocalID(input.localFlowId, '本地 HTTP Flow 标识无效')
  const capturedAt = validateRFC3339Nano(input.capturedAt)
  const summary = validateHTTPFlowSummary(input.summary)
  const requestBytes = requireUint8Array(input.request, 'HTTP Flow 请求原始字节无效')
  const responseBytes = requireUint8Array(input.response, 'HTTP Flow 响应原始字节无效')
  const [request, response] = await Promise.all([
    createSharedBytesPayload(requestBytes),
    createSharedBytesPayload(responseBytes),
  ])
  const flowKey = await hashKeyParts([clientId, localFlowId, request.sha256, response.sha256])
  const payload: SharedHTTPFlowPayload = {
    schema: SHARED_HTTP_FLOW_SCHEMA,
    flow_key: flowKey,
    captured_at: capturedAt,
    request,
    response,
    summary,
  }
  assertSharedRecordContentSize(JSON.stringify(payload))
  return payload
}

export const prepareSharedHTTPFlow = async (input: SharedHTTPFlowInput): Promise<PreparedSharedHTTPFlow> => {
  const payload = await createSharedHTTPFlowPayload(input)
  const content = JSON.stringify(payload)
  return {
    sourceClientId: input.clientId,
    localFlowId: input.localFlowId,
    flowKey: payload.flow_key,
    content,
    contentHash: await sha256Hex(utf8(content)),
    name: `HTTP Flow ${input.localFlowId}`,
    request: payload.request,
    response: payload.response,
    summary: payload.summary,
  }
}

export const resolveShareableRiskHTTPFlowId = (risk: Risk): number => {
  const record = asPlainRecord(risk, 'Risk 数据无效')
  if (!Object.prototype.hasOwnProperty.call(record, 'PacketPairs')) {
    throw new SharedRecordError('risk_flow_not_linked', 'Risk 未关联 HTTP Flow')
  }
  const packetPairs = record.PacketPairs
  if (!Array.isArray(packetPairs)) return invalidRecord('Risk 的 HTTP Flow 关联无效')
  const ids = new Set<number>()
  for (const value of packetPairs) {
    const pair = asPlainRecord(value, 'Risk 的 HTTP Flow 关联无效')
    if (!Object.prototype.hasOwnProperty.call(pair, 'HttpflowId')) continue
    ids.add(requirePositiveSafeInteger(pair.HttpflowId, 'Risk 的 HTTP Flow 关联无效'))
  }
  if (ids.size === 0) throw new SharedRecordError('risk_flow_not_linked', 'Risk 未关联 HTTP Flow')
  if (ids.size > 1) throw new SharedRecordError('risk_flow_ambiguous', 'Risk 关联了多个 HTTP Flow')
  return ids.values().next().value as number
}

export const resolveRiskHTTPFlowID = (risk: Pick<Risk, 'PacketPairs'> | Record<string, unknown>): number =>
  resolveShareableRiskHTTPFlowId(risk as Risk)

const compareCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) as number)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) as number)
  const length = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}

const serializeRiskValue = async (
  value: unknown,
  stack: Set<object>,
  undefinedInArray = false,
): Promise<string | undefined> => {
  if (value === null) return 'null'
  if (value === undefined) return undefinedInArray ? 'null' : undefined
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidRecord('Risk 载荷包含非有限数字')
    return JSON.stringify(value)
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    invalidRecord('Risk 载荷包含不支持的值')
  }
  if (!value || typeof value !== 'object') invalidRecord('Risk 载荷包含不支持的值')
  if (value instanceof ArrayBuffer) invalidRecord('Risk 载荷不允许直接包含 ArrayBuffer')
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    const payload = await createSharedBytesPayload(bytes)
    return `{"raw_base64":${JSON.stringify(payload.raw_base64)},"byte_length":${
      payload.byte_length
    },"sha256":${JSON.stringify(payload.sha256)}}`
  }
  if (stack.has(value)) invalidRecord('Risk 载荷包含循环引用')

  stack.add(value)
  try {
    if (Array.isArray(value)) {
      const serialized: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          serialized.push('null')
          continue
        }
        serialized.push((await serializeRiskValue(value[index], stack, true)) as string)
      }
      return `[${serialized.join(',')}]`
    }

    const record = asPlainRecord(value, 'Risk 载荷只允许普通对象')
    const descriptors = Object.getOwnPropertyDescriptors(record)
    if (Reflect.ownKeys(record).some((key) => typeof key === 'symbol')) {
      invalidRecord('Risk 载荷不允许 Symbol 属性')
    }
    const keys = Object.keys(record).sort(compareCodePoints)
    const serialized: string[] = []
    for (const key of keys) {
      const descriptor = descriptors[key]
      if (!descriptor || descriptor.get || descriptor.set) invalidRecord('Risk 载荷不允许访问器属性')
      const child = await serializeRiskValue(descriptor.value, stack)
      if (child !== undefined) serialized.push(`${JSON.stringify(key)}:${child}`)
    }
    return `{${serialized.join(',')}}`
  } finally {
    stack.delete(value)
  }
}

export const stableSerializeRiskPayload = async (value: unknown): Promise<string> => {
  const serialized = await serializeRiskValue(value, new Set())
  if (serialized === undefined) return invalidRecord('Risk 载荷不能为空')
  return serialized
}

export const serializeSharedRisk = async (risk: Risk): Promise<Uint8Array> =>
  utf8(await stableSerializeRiskPayload(risk))

export const createSharedRiskPayload = async (input: SharedRiskInput): Promise<SharedRiskPayload> => {
  const clientId = requireClientID(input.clientId)
  const localRiskId = requireLocalID(input.localRiskId, '本地 Risk 标识无效')
  const flowKey = requireSHA256(input.flowKey, 'Risk 关联的 flow_key 无效')
  const summary = validateRiskSummary(input.summary)
  const payloadBytes = requireUint8Array(input.payload, 'Risk 载荷字节无效')
  const payload = await createSharedBytesPayload(payloadBytes)
  const riskKey = await hashKeyParts([clientId, localRiskId, payload.sha256])
  const result: SharedRiskPayload = {
    schema: SHARED_RISK_SCHEMA,
    risk_key: riskKey,
    flow_key: flowKey,
    payload,
    summary,
  }
  assertSharedRecordContentSize(JSON.stringify(result))
  return result
}

export const prepareSharedRisk = async (input: SharedRiskInput): Promise<PreparedSharedRisk> => {
  const payload = await createSharedRiskPayload(input)
  const content = JSON.stringify(payload)
  return {
    sourceClientId: input.clientId,
    localRiskId: input.localRiskId,
    riskKey: payload.risk_key,
    flowKey: payload.flow_key,
    content,
    contentHash: await sha256Hex(utf8(content)),
    name: `Risk ${input.localRiskId}`,
    payload: payload.payload,
    summary: payload.summary,
  }
}

export const parseSharedHTTPFlowPayload = async (content: string): Promise<ParsedSharedHTTPFlow> => {
  assertSharedRecordContentSize(content)
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    invalidRecord('共享 HTTP Flow 正文不是有效 JSON')
  }
  const record = asPlainRecord(value, '共享 HTTP Flow 正文无效')
  requireExactKeys(
    record,
    ['schema', 'flow_key', 'captured_at', 'request', 'response', 'summary'],
    '共享 HTTP Flow 正文无效',
  )
  if (record.schema !== SHARED_HTTP_FLOW_SCHEMA) invalidRecord('共享 HTTP Flow schema 无效')
  const flowKey = requireSHA256(record.flow_key, '共享 HTTP Flow flow_key 无效')
  const capturedAt = validateRFC3339Nano(record.captured_at)
  const summary = validateHTTPFlowSummary(record.summary)
  const requestRecord = asPlainRecord(record.request, '共享 HTTP 请求描述无效')
  const responseRecord = asPlainRecord(record.response, '共享 HTTP 响应描述无效')
  requireExactKeys(requestRecord, ['raw_base64', 'byte_length', 'sha256'], '共享 HTTP 请求描述无效')
  requireExactKeys(responseRecord, ['raw_base64', 'byte_length', 'sha256'], '共享 HTTP 响应描述无效')
  const [request, response] = await Promise.all([
    verifySharedBytesPayload(requestRecord),
    verifySharedBytesPayload(responseRecord),
  ])
  return { flowKey, capturedAt, request, response, summary }
}

export const parseSharedRiskPayload = async (content: string): Promise<ParsedSharedRisk> => {
  assertSharedRecordContentSize(content)
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    invalidRecord('共享 Risk 正文不是有效 JSON')
  }
  const record = asPlainRecord(value, '共享 Risk 正文无效')
  requireExactKeys(record, ['schema', 'risk_key', 'flow_key', 'payload', 'summary'], '共享 Risk 正文无效')
  if (record.schema !== SHARED_RISK_SCHEMA) invalidRecord('共享 Risk schema 无效')
  const riskKey = requireSHA256(record.risk_key, '共享 Risk risk_key 无效')
  const flowKey = requireSHA256(record.flow_key, '共享 Risk flow_key 无效')
  const summary = validateRiskSummary(record.summary)
  const payloadRecord = asPlainRecord(record.payload, '共享 Risk 载荷描述无效')
  requireExactKeys(payloadRecord, ['raw_base64', 'byte_length', 'sha256'], '共享 Risk 载荷描述无效')
  const payload = await verifySharedBytesPayload(payloadRecord)
  return { riskKey, flowKey, payload, summary }
}

export const parseSharedHTTPFlow = parseSharedHTTPFlowPayload
export const parseSharedRisk = parseSharedRiskPayload
