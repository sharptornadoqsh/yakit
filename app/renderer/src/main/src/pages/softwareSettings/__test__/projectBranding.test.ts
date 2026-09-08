import { describe, expect, it } from 'vitest'
import { getProjectDisplayText } from '../projectBranding'

describe('睿眼项目展示', () => {
  it('导出再导入并改名后仍识别引擎生成的默认备注', () => {
    expect(getProjectDisplayText('123', '默认数据库(~/yakit-projects/***.db): Default Database!')).toBe(
      '默认数据库(~/RuiYan-Pentest/projects/***.db): Default Database!',
    )
  })

  it('不修改普通项目的自定义路径和提及旧目录的说明', () => {
    expect(getProjectDisplayText('123', '迁移来源：~/yakit-projects/default-yakit.db')).toBe(
      '迁移来源：~/yakit-projects/default-yakit.db',
    )
    expect(getProjectDisplayText('123', 'D:\\data\\default-yakit.db')).toBe('D:\\data\\default-yakit.db')
  })

  it('仅替换默认项目描述中的旧数据目录与默认库名', () => {
    expect(getProjectDisplayText('[default]', '默认数据库(~/yakit-projects/***.db): Default Database!')).toBe(
      '默认数据库(~/RuiYan-Pentest/projects/***.db): Default Database!',
    )
    expect(getProjectDisplayText('[default]', 'C:\\Data\\default-YAKIT.db')).toBe('C:\\Data\\default-RuiYan.db')
  })

  it('保留自定义目录、普通项目内容与空值', () => {
    expect(getProjectDisplayText('[default]', 'D:\\yakit-archive\\default-RuiYan.db')).toBe(
      'D:\\yakit-archive\\default-RuiYan.db',
    )
    expect(getProjectDisplayText('审计项目', '兼容 yakit 数据')).toBe('兼容 yakit 数据')
    expect(getProjectDisplayText('[default]', undefined)).toBe('')
  })
})
