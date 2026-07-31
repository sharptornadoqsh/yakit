import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  prepareSharedHTTPFlow,
  prepareSharedRisk,
  type PreparedSharedHTTPFlow,
  type PreparedSharedRisk,
} from '../sharedRecordAdapters'
import { SharedHTTPFlowDetail } from '../SharedHTTPFlowDetail'

var editorPropsMock = vi.fn()
var ipcInvokeMock = vi.fn()

vi.mock('@/utils/editors', () => ({
  NewHTTPPacketEditor: (props: Record<string, unknown>) => {
    editorPropsMock(props)
    const originalPackage = props.originalPackage as Uint8Array
    return (
      <div
        data-testid={props.isResponse ? 'shared-response-editor' : 'shared-request-editor'}
        data-bytes={Array.from(originalPackage).join(',')}
      />
    )
  },
}))

let preparedHTTP: PreparedSharedHTTPFlow
let preparedRisk: PreparedSharedRisk

beforeAll(async () => {
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: { invoke: ipcInvokeMock } }),
  })
  preparedHTTP = await prepareSharedHTTPFlow({
    clientId: 'desktop-client-7',
    localFlowId: '101',
    capturedAt: '2026-07-31T00:00:00Z',
    request: new Uint8Array([0, 255, 1]),
    response: new Uint8Array(),
    summary: {
      method: 'POST',
      url: 'https://shared.example/binary',
      host: 'shared.example:443',
      status_code: 204,
    },
  })
  preparedRisk = await prepareSharedRisk({
    clientId: 'desktop-client-7',
    localRiskId: '202',
    flowKey: preparedHTTP.flowKey,
    payload: new TextEncoder().encode('{"evidence":"strict"}'),
    summary: {
      title: 'Shared risk',
      severity: 'high',
      risk_type: 'fixture',
    },
  })
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('远端共享 HTTP Flow 只读详情', () => {
  test('严格解析后把精确原始字节交给低层只读编辑器，且不携带本地 ID 下载参数', async () => {
    render(<SharedHTTPFlowDetail httpContent={preparedHTTP.content} riskContent={preparedRisk.content} />)

    expect(await screen.findByTestId('shared-request-editor')).toHaveAttribute('data-bytes', '0,255,1')
    expect(screen.getByTestId('shared-response-editor')).toHaveAttribute('data-bytes', '')
    expect(screen.getByText('Shared risk')).toBeInTheDocument()
    expect(editorPropsMock).toHaveBeenCalledTimes(2)
    for (const [props] of editorPropsMock.mock.calls) {
      expect(props).toEqual(
        expect.objectContaining({
          readOnly: true,
          onlyBasicMenu: true,
          noPacketModifier: true,
          noOpenPacketNewWindow: true,
          noSendToComparer: true,
          showDownBodyMenu: false,
        }),
      )
      expect(props).not.toHaveProperty('downbodyParams')
      expect(props.originalPackage).toBeInstanceOf(Uint8Array)
    }
    expect(ipcInvokeMock).not.toHaveBeenCalled()
  })

  test.each([
    ['schema', (value: Record<string, unknown>) => (value.schema = 'yakit.shared-http-flow/v0')],
    [
      'Base64',
      (value: Record<string, unknown>) => {
        ;(value.request as Record<string, unknown>).raw_base64 = '*'
      },
    ],
    [
      '长度',
      (value: Record<string, unknown>) => {
        ;(value.request as Record<string, unknown>).byte_length = 4
      },
    ],
    [
      '哈希',
      (value: Record<string, unknown>) => {
        ;(value.request as Record<string, unknown>).sha256 = '0'.repeat(64)
      },
    ],
  ])('%s 不匹配时失败关闭且不创建编辑器', async (_, mutate) => {
    const value = JSON.parse(preparedHTTP.content) as Record<string, unknown>
    mutate(value)
    render(<SharedHTTPFlowDetail httpContent={JSON.stringify(value)} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('shared-request-editor')).not.toBeInTheDocument()
    expect(editorPropsMock).not.toHaveBeenCalled()
    expect(ipcInvokeMock).not.toHaveBeenCalled()
  })

  test('Risk 的 flowKey 与 HTTP 不一致时失败关闭', async () => {
    const mismatchedRisk = await prepareSharedRisk({
      clientId: 'desktop-client-7',
      localRiskId: '203',
      flowKey: '0'.repeat(64),
      payload: new Uint8Array([1]),
      summary: {
        title: 'Mismatched risk',
        severity: 'low',
        risk_type: 'fixture',
      },
    })
    render(<SharedHTTPFlowDetail httpContent={preparedHTTP.content} riskContent={mismatchedRisk.content} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('关联')
    expect(screen.queryByTestId('shared-request-editor')).not.toBeInTheDocument()
    expect(editorPropsMock).not.toHaveBeenCalled()
  })

  test.each([
    ['非法 UTF-8', new Uint8Array([0xc3, 0x28])],
    ['非 JSON', new TextEncoder().encode('not-json')],
  ])('Risk payload 为%s时失败关闭且不创建编辑器', async (_, payload) => {
    const invalidRisk = await prepareSharedRisk({
      clientId: 'desktop-client-7',
      localRiskId: '204',
      flowKey: preparedHTTP.flowKey,
      payload,
      summary: {
        title: 'Invalid payload risk',
        severity: 'high',
        risk_type: 'fixture',
      },
    })
    render(<SharedHTTPFlowDetail httpContent={preparedHTTP.content} riskContent={invalidRisk.content} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('shared-request-editor')).not.toBeInTheDocument()
    expect(editorPropsMock).not.toHaveBeenCalled()
  })

  test.each([
    ['null', 'null'],
    ['数组', '[]'],
    ['字符串', '"risk"'],
  ])('Risk payload 根值为%s时失败关闭且不创建编辑器', async (_, payload) => {
    const invalidRisk = await prepareSharedRisk({
      clientId: 'desktop-client-7',
      localRiskId: '205',
      flowKey: preparedHTTP.flowKey,
      payload: new TextEncoder().encode(payload),
      summary: {
        title: 'Invalid root risk',
        severity: 'high',
        risk_type: 'fixture',
      },
    })
    render(<SharedHTTPFlowDetail httpContent={preparedHTTP.content} riskContent={invalidRisk.content} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('shared-request-editor')).not.toBeInTheDocument()
    expect(editorPropsMock).not.toHaveBeenCalled()
  })

  test('切换内容后只展示最新一次严格解析结果', async () => {
    const next = await prepareSharedHTTPFlow({
      clientId: 'desktop-client-7',
      localFlowId: '102',
      capturedAt: '2026-07-31T00:01:00Z',
      request: new Uint8Array([9]),
      response: new Uint8Array([8]),
      summary: {
        method: 'GET',
        url: 'https://latest.example/',
        host: 'latest.example:443',
        status_code: 200,
      },
    })
    const view = render(<SharedHTTPFlowDetail httpContent={preparedHTTP.content} />)
    view.rerender(<SharedHTTPFlowDetail httpContent={next.content} />)

    expect(await screen.findByText('https://latest.example/')).toBeInTheDocument()
    expect(screen.getByTestId('shared-request-editor')).toHaveAttribute('data-bytes', '9')
  })
})
