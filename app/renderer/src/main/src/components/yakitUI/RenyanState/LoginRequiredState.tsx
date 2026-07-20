import React from 'react'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'
import emiter from '@/utils/eventBus/eventBus'
import { RenyanState } from './RenyanState'

const openLogin = () => {
  emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openLogin)
}

export const LoginRequiredState: React.FC = React.memo(() => {
  const { t } = useI18nNamespaces(['layout'])

  return (
    <RenyanState
      type="noPermission"
      title={t('Layout.RenyanState.loginRequiredTitle')}
      description={t('Layout.RenyanState.loginRequiredDescription')}
      actionLabel={t('Layout.RenyanState.loginRequiredAction')}
      onAction={openLogin}
    />
  )
})
