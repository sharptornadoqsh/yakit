import { describe, expect, it } from 'vitest'
import {
  getRuiYanMitmDefaultExcludeColumns,
  resolveRuiYanPluginLogUserName,
  resolveRuiYanPluginAuthor,
  resolveRuiYanVulnerabilitySelectionType,
} from '../renyanUiPolicy'

describe('睿眼界面策略', () => {
  it('插件仓库不展示服务端作者身份', () => {
    expect(resolveRuiYanPluginAuthor('yaklang.io')).toBe('RuiYan-Admin')
    expect(resolveRuiYanPluginAuthor('another-author')).toBe('RuiYan-Admin')
  })

  it('插件日志仅替换作者身份', () => {
    expect(resolveRuiYanPluginLogUserName('yaklang.io', true)).toBe('RuiYan-Admin')
    expect(resolveRuiYanPluginLogUserName('reviewer', false)).toBe('reviewer')
  })

  it('交互代理排除快捷操作列', () => {
    expect(getRuiYanMitmDefaultExcludeColumns()).toEqual(['action'])
  })

  it('旧按组状态归一为关键字方式', () => {
    expect(resolveRuiYanVulnerabilitySelectionType(true)).toBe('keyword')
    expect(resolveRuiYanVulnerabilitySelectionType(false)).toBe('keyword')
  })
})
