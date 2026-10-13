import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { passwordApi } from '../passwordTransport'

const mocks = vi.hoisted(() => ({ passwordApi: vi.fn(), axiosApi: vi.fn(), logoutDynamicControl: vi.fn() }))
vi.mock('../electronBridge', () => ({ yakitNetwork: mocks }))
vi.mock('@/utils/envfile', () => ({ globalUserLogout: vi.fn() }))
vi.mock('@/utils/login', () => ({ loginOutLocal: vi.fn() }))
vi.mock('@/utils/notification', () => ({ failed: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ default: { getFixedT: () => (key: string) => key } }))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('桌面密码专用桥', () => {
  it.each(['urm/login', 'urm/up/userinfo'] as const)('%s 仅经专用 IPC 提交并复用响应处理', async (url) => {
    const data = { pwd: ' Aa1!原文 ', old_pwd: 'OldPass2@', confirm_pwd: ' Aa1!原文 ' }
    mocks.passwordApi.mockResolvedValue({ code: 200, data: { ok: true } })
    await expect(passwordApi({ url, data })).resolves.toEqual({ ok: true })
    expect(mocks.passwordApi).toHaveBeenCalledWith({ url, data })
    expect(mocks.axiosApi).not.toHaveBeenCalled()
  })

  it('桥失败后不回落普通 HTTP 请求', async () => {
    mocks.passwordApi.mockRejectedValue(new Error('公钥请求失败'))
    await expect(passwordApi({ url: 'urm/login', data: { pwd: 'NoSend1!' } })).rejects.toThrow('公钥请求失败')
    expect(mocks.axiosApi).not.toHaveBeenCalled()
  })

  it('保留现有服务端错误语义', async () => {
    mocks.passwordApi.mockResolvedValue({ code: 400, message: '密码不正确' })
    await expect(passwordApi({ url: 'urm/login', data: { pwd: 'Wrong1!' } })).rejects.toBe('密码不正确')
  })

  it('登录与个人及首次改密实际调用点使用专用桥且不做 MD5', () => {
    const login = readFileSync(
      resolve(__dirname, '../../components/ConfigPrivateDomain/ConfigPrivateDomain.tsx'),
      'utf8',
    )
    const change = readFileSync(resolve(__dirname, '../../pages/SetPassword.tsx'), 'utf8')
    expect(login).toContain('passwordApi<API.UrmLoginRequest, API.UserData>')
    expect(login).not.toContain('md5Res')
    expect(login).not.toContain('yakitCodec')
    expect(change).toContain('passwordApi<API.UpUserInfoRequest, API.ActionSucceeded>')
    expect(change).toMatch(/data:\s*{\s*old_pwd,\s*pwd,\s*confirm_pwd,/)
    expect(change).not.toContain('NetWorkApi')
  })
})
