import { afterEach, describe, expect, it } from 'vitest'
import { USER_INFO, expireUserInfo, resetUserInfo } from '../state'

describe('state user session', () => {
  afterEach(() => {
    resetUserInfo()
  })

  it('retains a signed-in community session until the application restarts', () => {
    Object.assign(USER_INFO, {
      isLogin: true,
      platform: 'github',
      role: 'admin',
      token: 'community-token',
      user_id: 7,
    })

    const expiredUser = expireUserInfo()

    expect(expiredUser).toMatchObject({ isLogin: true, platform: 'github', user_id: 7, token: null })
    expect(USER_INFO).toMatchObject({ isLogin: true, platform: 'github', user_id: 7, token: 'community-token' })
  })

  it('clears an expired company session without exposing the token', () => {
    Object.assign(USER_INFO, {
      isLogin: true,
      platform: 'company',
      role: 'admin',
      token: 'sensitive-token',
      user_id: 7,
    })

    const expiredUser = expireUserInfo()

    expect(expiredUser).toMatchObject({ isLogin: true, user_id: 7, token: null })
    expect(USER_INFO).toMatchObject({ isLogin: false, user_id: 0, token: null })
  })

  it('keeps the startup state signed out when no session has authenticated', () => {
    const expiredUser = expireUserInfo()

    expect(expiredUser).toMatchObject({ isLogin: false, platform: null, token: null })
    expect(USER_INFO).toMatchObject({ isLogin: false, platform: null, token: null })
  })
})
