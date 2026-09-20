import { validateProjectImportPath } from '../projectImport'

describe('项目文件选择与手动路径校验', () => {
  it.each(['.ruiyanproject', '.ruiyanproject.enc', '.yakitproject', '.yakitproject.enc', '.db', '.sqlite', '.sqlite3'])(
    '允许引擎支持的格式 %s',
    (extension) => {
      expect(validateProjectImportPath(` /tmp/项目111${extension} `)).toBe(`/tmp/项目111${extension}`)
    },
  )
  it.each(['/tmp/风险报告.html', 'D:/报告.HTML', '/tmp/report.htm'])('风险报告 %s 返回明确原因', (path) => {
    expect(() => validateProjectImportPath(path)).toThrow('HTML 是风险报告')
  })
  it('空路径和伪扩展名失败，随后正确文件通过', () => {
    for (const path of ['', 'report.html.exe', 'project.zip']) expect(() => validateProjectImportPath(path)).toThrow()
    expect(validateProjectImportPath('D:/项目111.ruiyanproject')).toBe('D:/项目111.ruiyanproject')
  })
})
