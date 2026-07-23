import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  loginOutLocal: vi.fn(),
  logoutDynamicControl: vi.fn(),
  globalUserLogout: vi.fn(),
  isCommunityEdition: vi.fn(),
}))

vi.mock('antd', () => ({
  notification: {
    error: mocks.notifyError,
    info: mocks.notifyInfo,
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}))

vi.mock('@/assets/newIcon', () => ({
  CheckCircleOutlineIcon: () => null,
  CloseCircleIcon: () => null,
  ExclamationOutlineIcon: () => null,
}))

vi.mock('@/components/yakitUI/YakitTag/YakitTag', () => ({
  CopyComponents: () => null,
}))

vi.mock('@/utils/login', () => ({
  loginOutLocal: mocks.loginOutLocal,
}))

vi.mock('@/utils/envfile', () => ({
  globalUserLogout: mocks.globalUserLogout,
  isCommunityEdition: mocks.isCommunityEdition,
}))

vi.mock('../electronBridge', () => ({
  yakitNetwork: {
    axiosApi: vi.fn(),
    logoutDynamicControl: mocks.logoutDynamicControl,
  },
}))

vi.mock('@/i18n/i18n', () => ({
  default: {
    getFixedT: () => (key: string) => key,
  },
}))

const companyUser = {
  isLogin: true,
  platform: 'company',
  githubName: null,
  githubHeadImg: null,
  wechatName: null,
  wechatHeadImg: null,
  qqName: null,
  qqHeadImg: null,
  companyName: 'RuiYan',
  companyHeadImg: null,
  role: 'admin',
  user_id: 7,
  token: '',
}

let handleAxios: typeof import('../fetch').handleAxios
let tokenOverdue: typeof import('../fetch').tokenOverdue
let isTokenExpirationError: typeof import('../fetch').isTokenExpirationError

describe('token expiration session', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    ;({ handleAxios, tokenOverdue, isTokenExpirationError } = await import('../fetch'))
  })

  it('retains a community session without showing an expiration notice', () => {
    mocks.isCommunityEdition.mockReturnValue(true)
    tokenOverdue({ userInfo: companyUser })

    expect(mocks.notifyError).not.toHaveBeenCalled()
    expect(mocks.loginOutLocal).not.toHaveBeenCalled()
    expect(mocks.logoutDynamicControl).not.toHaveBeenCalled()
    expect(mocks.globalUserLogout).not.toHaveBeenCalled()
  })

  it('preserves the existing sign-out behavior for an expired company session', () => {
    mocks.isCommunityEdition.mockReturnValue(false)
    tokenOverdue({ userInfo: companyUser })

    expect(mocks.loginOutLocal).toHaveBeenCalledWith(companyUser)
    expect(mocks.logoutDynamicControl).toHaveBeenCalledWith({ loginOut: false })
    expect(mocks.globalUserLogout).toHaveBeenCalledTimes(1)
    expect(mocks.notifyError).toHaveBeenCalledTimes(1)
  })

  it('同一企业会话的并发过期响应只退出并提示一次', () => {
    mocks.isCommunityEdition.mockReturnValue(false)

    tokenOverdue({ userInfo: companyUser })
    tokenOverdue({ userInfo: companyUser })

    expect(mocks.loginOutLocal).toHaveBeenCalledTimes(1)
    expect(mocks.logoutDynamicControl).toHaveBeenCalledTimes(1)
    expect(mocks.globalUserLogout).toHaveBeenCalledTimes(1)
    expect(mocks.notifyError).toHaveBeenCalledTimes(1)
  })

  it('识别字符串与错误对象中的令牌过期消息', () => {
    expect(isTokenExpirationError('token过期')).toBe(true)
    expect(isTokenExpirationError(new Error('token过期'))).toBe(true)
    expect(isTokenExpirationError('网络连接失败')).toBe(false)
  })

  it('接受第二版接口的全部成功状态码', () => {
    const resolve = vi.fn()
    const reject = vi.fn()
    const response = { ok: true, data: { id: 71 } }

    handleAxios({ code: 201, data: response } as never, resolve, reject)

    expect(resolve).toHaveBeenCalledWith(response)
    expect(reject).not.toHaveBeenCalled()
  })

  it('保留第二版接口的冲突状态和服务端错误码', () => {
    const resolve = vi.fn()
    const reject = vi.fn()

    handleAxios(
      {
        code: 409,
        message: '项目版本冲突',
        data: { ok: false, error: { code: 'version_conflict', message: '项目版本冲突' } },
      } as never,
      resolve,
      reject,
    )

    expect(resolve).not.toHaveBeenCalled()
    expect(reject).toHaveBeenCalledTimes(1)
    expect(reject.mock.calls[0][0]).toMatchObject({
      status: 409,
      code: 'version_conflict',
      response: { status: 409, data: { code: 'version_conflict', message: '项目版本冲突' } },
    })
  })
})
