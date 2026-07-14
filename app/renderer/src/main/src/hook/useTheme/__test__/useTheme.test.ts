import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from '..'

vi.mock('@/services/electronBridge', () => ({
  yakitTheme: {
    setTheme: vi.fn(),
  },
}))

describe('睿眼主题变量', () => {
  beforeEach(() => {
    useTheme.getState().syncTheme('light')
  })

  it('在亮色模式向文档根节点应用主色和状态色', () => {
    const style = document.documentElement.style

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(style.getPropertyValue('--Colors-Use-Main-Primary')).toBe('#315efb')
    expect(style.getPropertyValue('--Colors-Use-Success-Primary')).toBe('#148f7a')
    expect(style.getPropertyValue('--Colors-Use-Warning-Primary')).toBe('#a66e0d')
    expect(style.getPropertyValue('--Colors-Use-Error-Primary')).toBe('#c9363b')
  })

  it('在暗色模式应用高对比主色和状态色', () => {
    useTheme.getState().syncTheme('dark')
    const style = document.documentElement.style

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(style.getPropertyValue('--Colors-Use-Main-Primary')).toBe('#7291ff')
    expect(style.getPropertyValue('--Colors-Use-Success-Primary')).toBe('#45d6bb')
    expect(style.getPropertyValue('--Colors-Use-Warning-Primary')).toBe('#f0b955')
    expect(style.getPropertyValue('--Colors-Use-Error-Primary')).toBe('#ff7175')
  })
})
