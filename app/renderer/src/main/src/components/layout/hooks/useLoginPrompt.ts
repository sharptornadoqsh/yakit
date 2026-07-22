import { useEffect, useState } from 'react'
import { useMemoizedFn } from 'ahooks'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'
import emiter from '@/utils/eventBus/eventBus'

export const useLoginPrompt = (isLogin: boolean) => {
  const [loginShow, setLoginShow] = useState(false)

  const openLogin = useMemoizedFn(() => {
    if (!isLogin) setLoginShow(true)
  })
  const closeLogin = useMemoizedFn(() => setLoginShow(false))

  useEffect(() => {
    if (isLogin) closeLogin()
  }, [isLogin])

  useEffect(() => {
    const handleOpenLogin = (command: string) => {
      if (command === RENYAN_SHELL_EVENTS.openLogin) openLogin()
    }
    emiter.on('onUIOpSettingMenuSelect', handleOpenLogin)
    return () => emiter.off('onUIOpSettingMenuSelect', handleOpenLogin)
  }, [])

  return { loginShow, openLogin, closeLogin }
}
