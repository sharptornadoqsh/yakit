import { describe, expect, it } from 'vitest'
import { USER_INFO, expireUserInfo, resetUserInfo } from '../state'

describe('state user session', () => {
  it('returns logout context without exposing the token and clears the active session', () => {
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
    resetUserInfo()
  })
})
