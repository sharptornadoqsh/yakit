import { describe, expect, it, vi } from 'vitest'
import { applyCollaborationClientHeaders, createCollaborationClientHeaders } from '../collaborationClientIdentity'

describe('团队协作客户端标识', () => {
  it('首次生成标识后写入现有应用配置', () => {
    const setConfig = vi.fn(() => true)
    const headers = createCollaborationClientHeaders({
      getConfig: () => ({}),
      setConfig,
      createId: () => '67a9ff5a-3a08-4f08-aa11-770205ace231',
      hostname: () => 'workstation-a',
      platform: 'win32',
      arch: 'x64',
      version: '1.4.0',
    })

    expect(setConfig).toHaveBeenCalledWith('collaborationClientId', '67a9ff5a-3a08-4f08-aa11-770205ace231')
    expect(headers).toEqual({
      'X-Yakit-Client-ID': '67a9ff5a-3a08-4f08-aa11-770205ace231',
      'X-Yakit-Device-Name': 'workstation-a',
      'X-Yakit-Hostname': 'workstation-a',
      'X-Yakit-OS': 'win32/x64',
      'X-Yakit-Version': '1.4.0',
    })
  })

  it('复用持久化标识并覆盖调用方伪造的客户端头', () => {
    const setConfig = vi.fn()
    const identity = createCollaborationClientHeaders({
      getConfig: () => ({ collaborationClientId: 'existing-client-id' }),
      setConfig,
      hostname: () => 'workstation-b',
      platform: 'linux',
      arch: 'arm64',
      version: '2.0.0',
    })
    const headers = applyCollaborationClientHeaders(
      { Authorization: 'token', 'X-Yakit-Client-ID': 'spoofed-client-id' },
      identity,
    )

    expect(setConfig).not.toHaveBeenCalled()
    expect(headers.Authorization).toBe('token')
    expect(headers['X-Yakit-Client-ID']).toBe('existing-client-id')
  })
})
