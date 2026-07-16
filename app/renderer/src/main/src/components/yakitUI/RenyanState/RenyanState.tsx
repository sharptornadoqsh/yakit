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
import { useRuiYanVisual } from '@/components/renyanUI/RuiYanVisualContext'

interface RenyanStateProps {
  type: RenyanStateType
  title?: React.ReactNode
  description?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}

const StateIcon: React.FC<{ type: RenyanStateType; asset?: string }> = React.memo(({ type, asset }) => {
  if (asset && type !== 'loading' && type !== 'noPermission') {
    return <img className={styles['state-icon-artwork']} src={asset} alt="" />
  }
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
  const ruiYanVisual = useRuiYanVisual()
  const defaults = RENYAN_STATE_TRANSLATION_KEYS[type]
  const stateAsset =
    type === 'error'
      ? ruiYanVisual?.stateAssets.error
      : type === 'offline'
        ? ruiYanVisual?.stateAssets.offline
        : type === 'empty'
          ? ruiYanVisual?.stateAssets.empty
          : undefined

  return (
    <div
      className={classNames(styles['state'], styles[`state-${type}`], {
        [styles['state-compact']]: compact,
        [styles['state-artwork']]: Boolean(stateAsset),
      })}
      data-state={type}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'loading' ? 'polite' : undefined}
    >
      <div className={styles['state-icon']}>
        <StateIcon type={type} asset={stateAsset} />
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
