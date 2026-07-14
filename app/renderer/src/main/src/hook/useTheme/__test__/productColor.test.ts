import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetMainColor } from '@/utils/envfile'

vi.mock('@/services/electronBridge', () => ({
  yakitRelease: {
    setEditionRaw: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/utils/notification', () => ({
  info: vi.fn(),
}))

vi.mock('@/utils/kv', () => ({
  setRemoteValue: vi.fn(),
}))

const initialPlatform = process.env.REACT_APP_PLATFORM

describe('睿眼产品主色', () => {
  afterEach(() => {
    process.env.REACT_APP_PLATFORM = initialPlatform
  })

  it('企业免许可证构建在亮色和暗色模式使用睿眼蓝色', () => {
    process.env.REACT_APP_PLATFORM = 'enterprise'

    expect(GetMainColor('light')).toBe('#315EFB')
    expect(GetMainColor('dark')).toBe('#7291FF')
  })

  it('便携版和社区版沿用相同的睿眼产品主色', () => {
    process.env.REACT_APP_PLATFORM = 'simple-enterprise'
    expect(GetMainColor('light')).toBe('#315EFB')

    process.env.REACT_APP_PLATFORM = 'yakit'
    expect(GetMainColor('dark')).toBe('#7291FF')
  })
})
