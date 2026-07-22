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

let tokenOverdue: typeof import('../fetch').tokenOverdue

describe('token expiration session', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    ;({ tokenOverdue } = await import('../fetch'))
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
})
