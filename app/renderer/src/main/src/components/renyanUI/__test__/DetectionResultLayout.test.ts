import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.env.DETECTION_LAYOUT_ROOT || process.cwd()
const source = (file: string) => readFileSync(path.join(root, 'app/renderer/src/main/src', file), 'utf8')
const layout = source('pages/securityTool/securityTool.scss')
const batch = source('pages/plugins/pluginBatchExecutor/PluginBatchExecutor.module.scss')
const theme = source('components/renyanUI/RuiYanPage.module.scss')

describe('检测结果布局', () => {
  it('执行区按标题下的剩余高度伸缩', () => {
    const body = layout.split('.#{$text}-executor-body {')[1].split('&-cont')[0]
    expect(body).toContain('flex: 1;')
    expect(body).toContain('min-height: 0;')
    expect(body).not.toContain('height: 100%;')
  })

  it('专项与通用检测的中间容器传递弹性高度', () => {
    expect(layout).toMatch(/&-cont\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*flex: 1;[^}]*min-height: 0;/)
  })

  it('收起配置时结果区取消固定最小高度', () => {
    expect(batch).toMatch(/\.result-stage\s*\{[\s\S]*?> :last-child\s*\{\s*min-height: 0;/)
  })

  it('展开配置时仍能滚动到表单与结果', () => {
    expect(batch).toMatch(/\.plugin-batch-execute-form-wrapper\s*\{[^}]*flex-shrink: 0;/)
    expect(batch).toMatch(
      /:not\(\.plugin-batch-execute-form-wrapper-hidden\) \+ \.result-stage\s*\{\s*flex-shrink: 0;\s*min-height: 500px;/,
    )
  })

  it('虚拟表头在浅色页面使用同组背景与文字变量', () => {
    const header = theme.split(".ruiyan-page :global([class*='virtual-table-col']) {")[1]?.split('}')[0] || ''
    expect(header).toContain('--Colors-Use-Neutral-Bg-Hover: var(--ruiyan-color-surface-muted);')
    expect(header).toContain('--Colors-Use-Neutral-Text-1-Title: var(--ruiyan-color-text-secondary);')
    expect(header).toContain('--Colors-Use-Neutral-Disable: var(--ruiyan-color-text-secondary);')
  })

  it('保留结果列表的既有滚动样式', () => {
    expect(theme).toContain("[class*='virtual-table-list-container']::-webkit-scrollbar")
    expect(batch).toMatch(/&-cont\s*\{\s*min-width: 750px;\s*overflow: auto;/)
  })
})
