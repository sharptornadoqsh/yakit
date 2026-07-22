import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserInfoProps } from '@/store'
import { USER_SESSION_REFRESH_INTERVAL_MS, useUserSession } from '../useUserSession'

const mocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
  globalUserLogin: vi.fn(),
  resetTokenExpirationState: vi.fn(),
}))

vi.mock('@/utils/login', () => ({
  refreshToken: mocks.refreshToken,
}))

vi.mock('@/utils/envfile', () => ({
  globalUserLogin: mocks.globalUserLogin,
}))

vi.mock('@/services/fetch', () => ({
  resetTokenExpirationState: mocks.resetTokenExpirationState,
}))

const signedOutUser: UserInfoProps = {
  isLogin: false,
  platform: null,
  githubName: null,
  githubHeadImg: null,
  wechatName: null,
  wechatHeadImg: null,
  qqName: null,
  qqHeadImg: null,
  companyName: null,
  companyHeadImg: null,
  role: null,
  user_id: null,
  token: '',
}

const signedInUser: UserInfoProps = {
  ...signedOutUser,
  isLogin: true,
  platform: 'company',
  companyName: 'RuiYan',
  role: 'admin',
  user_id: 7,
  token: 'company-token',
}

type SessionHarnessProps = {
  userInfo: UserInfoProps
  setStoreUserInfo: (userInfo: UserInfoProps) => void
}

const SessionHarness: React.FC<SessionHarnessProps> = ({ userInfo, setStoreUserInfo }) => {
  useUserSession(userInfo, setStoreUserInfo)
  return null
}

describe('用户会话生命周期', () => {
  const listeners = new Map<string, (...args: any[]) => void>()
  const ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn((channel: string, listener: (...args: any[]) => void) => {
      listeners.set(channel, listener)
    }),
    removeListener: vi.fn((channel: string, listener: (...args: any[]) => void) => {
      if (listeners.get(channel) === listener) listeners.delete(channel)
    }),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    listeners.clear()
    ipcRenderer.invoke.mockResolvedValue(signedInUser)
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: () => ({ ipcRenderer }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('挂载时复用主进程中的现有登录态', async () => {
    const setStoreUserInfo = vi.fn()
    render(<SessionHarness userInfo={signedOutUser} setStoreUserInfo={setStoreUserInfo} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-login-user-info')
    expect(setStoreUserInfo).toHaveBeenCalledWith(signedInUser)
    expect(mocks.globalUserLogin).toHaveBeenCalledWith('company-token')
    expect(mocks.resetTokenExpirationState).toHaveBeenCalledWith('company-token')
  })

  it('登录期间即时、定时及事件触发令牌刷新', () => {
    const setStoreUserInfo = vi.fn()
    const view = render(<SessionHarness userInfo={signedInUser} setStoreUserInfo={setStoreUserInfo} />)

    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
    expect(mocks.refreshToken).toHaveBeenLastCalledWith(signedInUser)

    act(() => {
      vi.advanceTimersByTime(USER_SESSION_REFRESH_INTERVAL_MS)
    })
    expect(mocks.refreshToken).toHaveBeenCalledTimes(2)

    act(() => {
      listeners.get('refresh-token')?.({}, undefined)
    })
    expect(mocks.refreshToken).toHaveBeenCalledTimes(3)

    const refreshListener = listeners.get('refresh-token')
    view.unmount()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('refresh-token', refreshListener)

    act(() => {
      vi.advanceTimersByTime(USER_SESSION_REFRESH_INTERVAL_MS)
    })
    expect(mocks.refreshToken).toHaveBeenCalledTimes(3)
  })

  it('登录事件同步新的会话并精确移除监听器', () => {
    const setStoreUserInfo = vi.fn()
    const view = render(<SessionHarness userInfo={signedOutUser} setStoreUserInfo={setStoreUserInfo} />)
    const signInListener = listeners.get('fetch-signin-token')

    act(() => {
      signInListener?.({}, signedInUser)
    })

    expect(setStoreUserInfo).toHaveBeenCalledWith(signedInUser)
    expect(mocks.globalUserLogin).toHaveBeenCalledWith('company-token')

    view.unmount()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('fetch-signin-token', signInListener)
  })
})
