import React, { useEffect, useMemo } from 'react'
import { YakitRoute } from '@/enums/yakitRoute'
import { productConfig } from '@/config/product'
import { YakitRouteToPageInfo } from '@/routes/newRoute'
import { findRenyanMenuPath } from '@/routes/renyanMenu'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import styles from './RenyanPageHeader.module.scss'
import { RuiYanModuleIcon } from '@/components/renyanUI/RuiYanModuleIcon'
import { useRuiYanVisual } from '@/components/renyanUI/RuiYanVisualContext'

interface RenyanPageHeaderProps {
  route: YakitRoute | string
  fallbackTitle?: string
  onNavigateHome: () => void
}

export const RenyanPageHeader: React.FC<RenyanPageHeaderProps> = React.memo((props) => {
  const { route, fallbackTitle, onNavigateHome } = props
  const { t } = useI18nNamespaces(['layout', 'yakitRoute'])
  const ruiYanVisual = useRuiYanVisual()
  const visual = ruiYanVisual?.visual
  const path = useMemo(() => findRenyanMenuPath(route), [route])
  const routeInfo = YakitRouteToPageInfo[route as YakitRoute]

  const getMenuTitle = (index: number) => {
    const item = path[index]
    if (!item) return ''
    const translated = t(item.titleKey)
    return translated === item.titleKey ? item.title : translated
  }

  const title = getMenuTitle(path.length - 1) || fallbackTitle || routeInfo?.label || String(route)
  const groupTitle = path.length > 1 ? getMenuTitle(0) : t('Layout.RenyanShell.workspace')
  const descriptionKey = routeInfo?.describeUi
  const translatedDescription = descriptionKey ? t(descriptionKey) : ''
  const description =
    translatedDescription && translatedDescription !== descriptionKey
      ? translatedDescription
      : routeInfo?.describe || ''

  useEffect(() => {
    document.title = `${title} · ${productConfig.displayName}`
    return () => {
      document.title = productConfig.displayName
    }
  }, [title])

  return (
    <div
      className={styles['page-header']}
      data-shell-region="page-header"
      data-route={route}
      data-ruiyan-page={visual ? 'true' : undefined}
    >
      <div className={styles['page-heading']}>
        <div className={styles['breadcrumb']} data-shell-region="breadcrumb">
          <span>{productConfig.displayName}</span>
          <span className={styles['breadcrumb-separator']}>/</span>
          <span>{groupTitle}</span>
          {path.length > 1 && (
            <>
              <span className={styles['breadcrumb-separator']}>/</span>
              <strong>{title}</strong>
            </>
          )}
        </div>
        <div className={styles['title-row']}>
          {visual && (
            <span className={styles['route-identity']}>
              <RuiYanModuleIcon route={route} />
              <span>
                <small>{visual.serial}</small>
                <strong>{visual.modeLabel}</strong>
              </span>
            </span>
          )}
          <h1>{title}</h1>
        </div>
        {description && <p className={styles['page-description']}>{description}</p>}
      </div>
      <div className={styles['page-actions']} data-shell-region="page-actions">
        <span className={styles['workspace-state']}>
          <span />
          {t('Layout.RenyanShell.localWorkspace')}
        </span>
        {route !== YakitRoute.NewHome && (
          <YakitButton type="secondary2" size="small" onClick={onNavigateHome}>
            {t('Layout.RenyanShell.backToWorkbench')}
          </YakitButton>
        )}
      </div>
    </div>
  )
})
