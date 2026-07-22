import { describe, expect, it } from 'vitest'
import { getProjectDisplayText } from '../projectBranding'

describe('睿眼项目展示', () => {
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
