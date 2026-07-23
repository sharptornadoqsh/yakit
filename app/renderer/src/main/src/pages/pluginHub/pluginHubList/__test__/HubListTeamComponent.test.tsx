import { readFileSync } from 'fs'
import * as ts from 'typescript'

describe('团队插件页面模块', () => {
  it('本地上传入口通过语法诊断', () => {
    const filePath = 'app/renderer/src/main/src/pages/pluginHub/pluginHubList/HubListTeam.tsx'
    const source = readFileSync(filePath, 'utf8')
    const result = ts.transpileModule(source, {
      fileName: filePath,
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
      },
    })
    const errors = (result.diagnostics || []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )

    expect(errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    expect(source).toContain('上传本地插件')
    expect(source).toContain('批量安装')
    expect(source).toContain('本地同名插件')
  })
})
