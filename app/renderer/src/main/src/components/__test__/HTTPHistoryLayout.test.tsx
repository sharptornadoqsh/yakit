import React from 'react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import ts from 'typescript'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { HTTPFlowRealTimeTableAndEditor } from '../HTTPHistory'

const electronFixture = vi.hoisted(() => {
  const original = Object.getOwnPropertyDescriptor(window, 'require')
  Object.defineProperty(window, 'require', {
    configurable: true,
    writable: true,
    value: () => ({ ipcRenderer: { invoke: vi.fn() } }),
  })
  return { original }
})
vi.mock('../HTTPFlowTable/HTTPFlowTable', () => ({
  HTTP_FLOW_FAVORITE_TAG: 'favorite',
  HTTPFlowTable: ({ onSelected, setOnlyShowFirstNode }: any) => (
    <div aria-label="traffic-table">
      {[1, 2].map((Id) => (
        <button
          key={Id}
          onClick={() => {
            onSelected({ Id, Method: 'GET', Url: `/sample/${Id}` })
            setOnlyShowFirstNode(false)
          }}
        >
          flow-{Id}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('../HTTPFlowDetail', () => ({
  HTTPFlowDetailMini: ({ selectedFlow }: any) => (
    <section aria-label="packet-detail">
      <pre>GET {selectedFlow.Url} HTTP/1.1</pre>
      <pre>HTTP/1.1 200 OK</pre>
    </section>
  ),
}))
vi.mock('@/store/mitmState', () => ({ useStore: () => ({ isRefreshHistory: false }) }))
vi.mock('@/utils/kv', () => ({ getRemoteValue: async () => '', setRemoteValue: vi.fn() }))
vi.mock('@/utils/tool', () => ({ JSONParseLog: JSON.parse }))
vi.mock('@/i18n/useI18nNamespaces', () => ({ useI18nNamespaces: () => ({ t: (key: string) => key }) }))
vi.mock('../WebTree/WebTree', () => ({ WebTree: () => null }))
vi.mock('@/assets/icon/outline', () =>
  Object.fromEntries(
    [
      'OutlineBotIcon',
      'OutlineFileSlidersIcon',
      'OutlineFilterIcon',
      'OutlineLog2Icon',
      'OutlineMessageCirclePlusIcon',
      'OutlineSearchIcon',
      'OutlineXIcon',
      'OutlineChevrondoubledownIcon',
    ].map((name) => [name, () => null]),
  ),
)
vi.mock('@/assets/commonProcessIcons', () =>
  Object.fromEntries(
    [
      'BaiduNetdiskIcon',
      'BashIcon',
      'BurpSuiteCommunityIcon',
      'BurpSuiteProfessionalIcon',
      'ChromeIcon',
      'ClashIconSvgIcon',
      'Cse360Icon',
      'CursorIcon',
      'DingtalkIcon',
      'DockerIcon',
      'ExcelIcon',
      'FeishuIcon',
      'FinderIcon',
      'FirefoxIcon',
      'JavaIcon',
      'MsedgeIcon',
      'OpenvpnIcon',
      'OperaIcon',
      'PowerpointIcon',
      'ProxifierIcon',
      'QqIcon',
      'Se360Icon',
      'TelegramIcon',
      'UToolsIcon',
      'VMwareIcon',
      'VscodeIcon',
      'WechatIcon',
      'WordIconIcon',
      'ZSHIcon',
    ].map((name) => [name, () => null]),
  ),
)
vi.mock('@/assets/newIcon', () => ({ ClockIcon: () => null, RefreshIcon: () => null }))
vi.mock('../yakitUI/YakitInput/YakitInput', () => ({ YakitInput: () => null }))
vi.mock('../yakitUI/YakitEmpty/YakitEmpty', () => ({ YakitEmpty: () => null }))
vi.mock('../yakitUI/YakitSpin/YakitSpin', () => ({ YakitSpin: () => null }))
vi.mock('../yakitUI/YakitButton/YakitButton', () => ({ YakitButton: () => null }))
vi.mock('../yakitUI/YakitCheckbox/YakitCheckbox', () => ({ YakitCheckbox: () => null }))
vi.mock('../yakitUI/YakitPopover/YakitPopover', () => ({ YakitPopover: () => null }))
vi.mock('../yakitUI/YakitCollapse/YakitCollapse', () => ({ default: { YakitPanel: () => null } }))
vi.mock('react-resize-detector', () => ({ default: () => null }))
vi.mock('../HTTPHistory.module.scss', () => ({ default: new Proxy({}, { get: (_, key) => String(key) }) }))
vi.mock('../yakitUI/YakitResizeBox/YakitResizeBox.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))
vi.mock('@/pages/ai-agent/store/ChatDataStore', () => ({ histroyAiStore: () => ({}) }))
vi.mock('../historyAIReActChat', () => ({ HistoryAIReActChatProvider: () => null, useHistoryAIReActChat: () => ({}) }))
vi.mock('../HTTPFlowTable/HTTPFlowRuleDataFilter', () => ({ HTTPFlowRuleDataFilter: () => null }))
vi.mock('../HTTPFlowTable/useBuiltinTagList', () => ({ useBuiltinTagList: () => ({}) }))
vi.mock('@/utils/notification', () => ({ yakitNotify: vi.fn() }))
vi.mock('../renyanUI', () => ({
  RuiYanDrawer: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
  RuiYanButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  RuiYanEmptyState: () => null,
  RuiYanIconButton: () => null,
  RuiYanSegmented: () => null,
}))

const entryProps = (file: string) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(resolve(process.env.TRAFFIC_LAYOUT_SOURCE_ROOT || process.cwd(), file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let result: any
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(source) === 'HTTPFlowRealTimeTableAndEditor'
    ) {
      result = {}
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !attr.initializer) continue
        if (ts.isStringLiteral(attr.initializer)) result[attr.name.getText(source)] = attr.initializer.text
        if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword)
          result[attr.name.getText(source)] = false
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!result) throw new Error('Traffic entry not found')
  return result
}

afterEach(cleanup)
afterAll(() => {
  if (electronFixture.original) Object.defineProperty(window, 'require', electronFixture.original)
  else delete (window as any).require
})

describe.each([
  ['History', 'app/renderer/src/main/src/components/HTTPHistory.tsx'],
  ['MITM', 'app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMHijackedContent.tsx'],
])('%s 报文布局', (pageType, file) => {
  const mount = () => render(<HTTPFlowRealTimeTableAndEditor pageType={pageType as any} {...entryProps(file)} />)

  it('选中流量后使用上下布局并让报文占用全宽', () => {
    const { container } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'flow-1' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const split = container.querySelector('.resize-box') as HTMLElement
    expect(split).not.toBeNull()
    expect(split.style.flexFlow).toBe('column')
    const packet = screen.getByRole('region', { name: 'packet-detail' })
    expect(packet.closest('.history-detail-split')?.parentElement?.style.width).toBe('100%')
    expect(packet).toHaveTextContent('GET /sample/1 HTTP/1.1')
    expect(packet).toHaveTextContent('HTTP/1.1 200 OK')
  })

  it('收起后恢复列表并允许重新查看另一条流量', () => {
    const { container } = mount()
    expect(screen.queryByRole('region', { name: 'packet-detail' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'flow-1' }))
    const handle = container.querySelector('.resize-split-handle')
    expect(handle).not.toBeNull()
    fireEvent.click(handle!)
    expect(screen.queryByRole('region', { name: 'packet-detail' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'flow-2' }))
    expect(screen.getByRole('region', { name: 'packet-detail' })).toHaveTextContent('GET /sample/2 HTTP/1.1')
  })
})
