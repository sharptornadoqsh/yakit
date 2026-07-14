import React from 'react'
import classNames from 'classnames'
import { productConfig } from '@/config/product'
import { YaklangEngineMode } from '@/yakitGVDefine'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import styles from './RenyanStatusBar.module.scss'

interface RenyanStatusBarProps {
  engineLink: boolean
  engineMode?: YaklangEngineMode
}

export const RenyanStatusBar: React.FC<RenyanStatusBarProps> = React.memo((props) => {
  const { engineLink, engineMode } = props
  const { t } = useI18nNamespaces(['layout'])
  const modeLabel = engineMode === 'remote' ? t('Layout.RenyanShell.remoteEngine') : t('Layout.RenyanShell.localEngine')

  return (
    <footer className={styles['status-bar']} data-testid="renyan-status-bar">
      <div className={styles['status-group']}>
        <span
          className={classNames(styles['status-dot'], {
            [styles['status-dot-online']]: engineLink,
            [styles['status-dot-offline']]: !engineLink,
          })}
        />
        <span>{engineLink ? t('Layout.RenyanShell.engineConnected') : t('Layout.RenyanShell.engineOffline')}</span>
      </div>
      <div className={styles['status-divider']} />
      <div className={styles['status-group']}>
        <span className={styles['status-label']}>{t('Layout.RenyanShell.engineMode')}</span>
        <strong>{modeLabel}</strong>
      </div>
      <div className={styles['status-divider']} />
      <div className={styles['status-group']}>
        <span className={styles['status-label']}>{t('Layout.RenyanShell.teamService')}</span>
        <strong className={styles['planned-status']}>{t('Layout.RenyanShell.planned')}</strong>
      </div>
      <div className={styles['status-product']}>{productConfig.shortName}</div>
    </footer>
  )
})
