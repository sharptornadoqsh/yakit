import React from 'react'
import classNames from 'classnames'
import {
  OutlineCollectionIcon,
  OutlineExclamationcircleIcon,
  OutlineLockclosedIcon,
  OutlineRefreshIcon,
  OutlineStatusofflineIcon,
} from '@/assets/icon/outline'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { YakitButton } from '../YakitButton/YakitButton'
import { RENYAN_STATE_TRANSLATION_KEYS, RenyanStateType } from './stateConfig'
import styles from './RenyanState.module.scss'

interface RenyanStateProps {
  type: RenyanStateType
  title?: React.ReactNode
  description?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}

const StateIcon: React.FC<{ type: RenyanStateType }> = React.memo(({ type }) => {
  switch (type) {
    case 'loading':
      return <span className={styles['loading-indicator']} />
    case 'error':
      return <OutlineExclamationcircleIcon />
    case 'noPermission':
      return <OutlineLockclosedIcon />
    case 'offline':
      return <OutlineStatusofflineIcon />
    case 'empty':
    default:
      return <OutlineCollectionIcon />
  }
})

export const RenyanState: React.FC<RenyanStateProps> = React.memo((props) => {
  const { type, title, description, actionLabel, onAction, compact = false } = props
  const { t } = useI18nNamespaces(['layout'])
  const defaults = RENYAN_STATE_TRANSLATION_KEYS[type]

  return (
    <div
      className={classNames(styles['state'], styles[`state-${type}`], {
        [styles['state-compact']]: compact,
      })}
      data-state={type}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'loading' ? 'polite' : undefined}
    >
      <div className={styles['state-icon']}>
        <StateIcon type={type} />
      </div>
      <div className={styles['state-content']}>
        <strong>{title || t(defaults.title)}</strong>
        <span>{description || t(defaults.description)}</span>
      </div>
      {actionLabel && onAction && (
        <YakitButton type="secondary2" size="small" icon={<OutlineRefreshIcon />} onClick={onAction}>
          {actionLabel}
        </YakitButton>
      )}
    </div>
  )
})
