import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const stylesheetPath = resolve(
  process.cwd(),
  'app/renderer/src/main/src/pages/fuzzer/WebFuzzerPage/WebFuzzerPage.module.scss',
)
const stylesheet = readFileSync(stylesheetPath, 'utf8')

describe('报文工具布局约束', () => {
  it('根容器和内容区均受可用宽度限制', () => {
    const rootDeclarations = stylesheet.slice(
      stylesheet.indexOf('.web-fuzzer {'),
      stylesheet.indexOf('.web-fuzzer-toolbar'),
    )
    const contentDeclarations = stylesheet.match(/\.web-fuzzer-tab-content\s*\{([^}]*)\}/s)?.[1]

    expect(rootDeclarations).toContain('width: 100%;')
    expect(rootDeclarations).toContain('min-width: 0;')
    expect(rootDeclarations).toContain('align-items: stretch;')
    expect(contentDeclarations).toContain('width: 100%;')
    expect(contentDeclarations).toContain('min-width: 0;')
  })
})
