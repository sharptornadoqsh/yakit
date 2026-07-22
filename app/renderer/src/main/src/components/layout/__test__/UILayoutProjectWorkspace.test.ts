import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const sourcePath = resolve(process.cwd(), 'app/renderer/src/main/src/components/layout/UILayout.tsx')
const source = readFileSync(sourcePath, 'utf8')

describe('项目工作区数据库生命周期', () => {
  it('选择项目之前不允许关闭项目工作区', () => {
    const workspaceStart = source.indexOf('<RuiYanModal\n                open={showProjectManage}')
    const workspaceEnd = source.indexOf('</RuiYanModal>', workspaceStart)
    const workspace = source.slice(workspaceStart, workspaceEnd)

    expect(workspaceStart).toBeGreaterThan(-1)
    expect(workspace).toContain('closable={false}')
    expect(workspace).toContain('onFinish={softwareSettingFinish}')
  })
})
