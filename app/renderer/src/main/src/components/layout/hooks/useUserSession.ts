import { useEffect } from 'react'
import type { UserInfoProps } from '@/store'
import { resetTokenExpirationState } from '@/services/fetch'
import { globalUserLogin } from '@/utils/envfile'
import { refreshToken } from '@/utils/login'

export const USER_SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000

export const useUserSession = (userInfo: UserInfoProps, setStoreUserInfo: (userInfo: UserInfoProps) => void) => {
  useEffect(() => {
    const { ipcRenderer } = window.require('electron')
    const applyUserInfo = (nextUserInfo?: UserInfoProps) => {
      if (!nextUserInfo) return
      setStoreUserInfo(nextUserInfo)
      if (nextUserInfo.isLogin && nextUserInfo.token) {
        resetTokenExpirationState(nextUserInfo.token)
        void globalUserLogin(nextUserInfo.token)
      }
    }
    const handleSignIn = (_event: unknown, nextUserInfo: UserInfoProps) => {
      applyUserInfo(nextUserInfo)
    }

    ipcRenderer.on('fetch-signin-token', handleSignIn)
    ipcRenderer
      .invoke('get-login-user-info')
      .then(applyUserInfo)
      .catch(() => undefined)

    return () => {
      ipcRenderer.removeListener('fetch-signin-token', handleSignIn)
    }
  }, [setStoreUserInfo])

  useEffect(() => {
    if (!userInfo.isLogin || !userInfo.token) return

    const { ipcRenderer } = window.require('electron')
    const handleRefresh = () => {
      refreshToken(userInfo)
    }

    handleRefresh()
    const timer = window.setInterval(handleRefresh, USER_SESSION_REFRESH_INTERVAL_MS)
    ipcRenderer.on('refresh-token', handleRefresh)

    return () => {
      window.clearInterval(timer)
      ipcRenderer.removeListener('refresh-token', handleRefresh)
    }
  }, [userInfo])
}
