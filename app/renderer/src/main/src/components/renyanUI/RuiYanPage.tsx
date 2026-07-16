import React, { useMemo } from 'react'
import classNames from 'classnames'
import { YakitRoute } from '@/enums/yakitRoute'
import { buildRenyanMenu, findRenyanMenuPath, isRenyanMenuItemNavigable, RenyanMenuItem } from '@/routes/renyanMenu'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { RuiYanModuleIcon } from './RuiYanModuleIcon'
import { getRuiYanRouteVisual, RuiYanVisualProvider } from './RuiYanVisualContext'
import styles from './RuiYanPage.module.scss'

interface RuiYanPageProps {
  route: YakitRoute | string
  onNavigate: (route: YakitRoute) => void
  children: React.ReactNode
}

export const RuiYanPage: React.FC<RuiYanPageProps> = React.memo((props) => {
  const { route, onNavigate, children } = props
  const { t } = useI18nNamespaces(['layout'])
  const menu = useMemo(() => buildRenyanMenu(), [])
  const path = useMemo(() => findRenyanMenuPath(route, menu), [menu, route])
  const activeGroup = path[0]
  const activeItem = path[path.length - 1]
  const visual = getRuiYanRouteVisual(route)
  const items = activeGroup?.children.length ? activeGroup.children : activeGroup ? [activeGroup] : []
  const getTitle = (item?: RenyanMenuItem) => {
    if (!item) return ''
    const translated = t(item.titleKey)
    return translated === item.titleKey ? item.title : translated
  }

  if (!visual) return <>{children}</>

  return (
    <RuiYanVisualProvider route={route}>
      <div className={styles['ruiyan-page']} data-ruiyan-layout={visual.layout}>
        <aside className={styles['module-rail']} aria-label={getTitle(activeGroup)}>
          <div className={styles['module-identity']}>
            <span className={styles['module-serial']}>{visual.serial}</span>
            <RuiYanModuleIcon route={route} className={styles['module-icon']} />
            <strong>{getTitle(activeGroup)}</strong>
          </div>
          <nav className={styles['module-navigation']}>
            {items.map((item, index) => (
              <button
                type="button"
                key={item.key}
                className={classNames(styles['module-navigation-item'], {
                  [styles['module-navigation-item-active']]: item.route === route || item.key === activeItem?.key,
                })}
                disabled={!isRenyanMenuItemNavigable(item)}
                onClick={() => item.route && onNavigate(item.route)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{getTitle(item)}</strong>
              </button>
            ))}
          </nav>
          <div className={styles['module-state']}>
            <span />
            LOCAL ENGINE
          </div>
        </aside>
        <main className={styles['mission-workspace']}>
          <div className={styles['capability-strip']}>
            <strong>{visual.modeLabel}</strong>
            <div>
              {visual.signals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          </div>
          <div className={styles['mission-content']}>{children}</div>
        </main>
      </div>
    </RuiYanVisualProvider>
  )
})
