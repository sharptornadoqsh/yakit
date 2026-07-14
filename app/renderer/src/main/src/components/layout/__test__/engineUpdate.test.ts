import { describe, expect, it } from 'vitest'
import { resolveEngineUpdateStatus, shouldCheckEngineUpdate } from '../engineUpdate'

describe('主界面引擎后台更新检查', () => {
  it('仅在主界面已连接本地引擎后检查', () => {
    expect(shouldCheckEngineUpdate(false, 'local')).toBe(false)
    expect(shouldCheckEngineUpdate(true, 'remote')).toBe(false)
    expect(shouldCheckEngineUpdate(true, 'local')).toBe(true)
  })

  it('只把更高版本标记为可用更新', () => {
    expect(resolveEngineUpdateStatus('1.4.8-beta2', '1.4.8-beta3')).toBe('available')
    expect(resolveEngineUpdateStatus('1.4.8-beta3', '1.4.8-beta3')).toBe('current')
    expect(resolveEngineUpdateStatus('1.4.9-beta1', '1.4.8-beta3')).toBe('current')
    expect(resolveEngineUpdateStatus('', '1.4.8-beta3')).toBe('not-checked')
  })

  it('按正式版本和预发布版本语义比较更新', () => {
    expect(resolveEngineUpdateStatus('1.4.8-beta3', '1.4.8')).toBe('available')
    expect(resolveEngineUpdateStatus('1.4.8', '1.4.8-beta3')).toBe('current')
    expect(resolveEngineUpdateStatus('1.4.8-beta3', '1.4.8-beta10')).toBe('available')
  })
})
