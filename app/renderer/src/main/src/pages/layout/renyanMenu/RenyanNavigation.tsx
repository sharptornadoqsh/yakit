import React, { useEffect, useMemo, useState } from 'react'
import classNames from 'classnames'
import { YakitRoute } from '@/enums/yakitRoute'
import emiter from '@/utils/eventBus/eventBus'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import {
  RENYAN_SHELL_EVENTS,
  RenyanMenuItem,
  buildRenyanMenu,
  findRenyanMenuPath,
  flattenRenyanMenu,
  isRenyanMenuItemNavigable,
} from '@/routes/renyanMenu'
import {
  OutlineChevrondoubleleftIcon,
  OutlineChevrondoublerightIcon,
  OutlineChevrondownIcon,
} from '@/assets/icon/outline'
import styles from './RenyanNavigation.module.scss'

interface RenyanRouteSelection {
  route: YakitRoute
}

export interface RenyanNavigationProps {
  defaultExpand: boolean
  onMenuSelect: (route: RenyanRouteSelection) => void
  setRouteToLabel: (data: Map<string, string>) => void
}

export interface RenyanWorkspaceSidebarProps {
  currentRoute?: YakitRoute | string
  onMenuSelect: (route: RenyanRouteSelection) => void
}

const useMenuTitle = () => {
  const { t } = useI18nNamespaces(['layout'])
  return (item: RenyanMenuItem) => {
    const translated = t(item.titleKey)
    return translated === item.titleKey ? item.title : translated
  }
}

const activateMenuItem = (item: RenyanMenuItem, onMenuSelect: (route: RenyanRouteSelection) => void) => {
  if (!isRenyanMenuItemNavigable(item)) return
  if (item.route) {
    onMenuSelect({ route: item.route })
    return
  }

  switch (item.action) {
    case 'changeProject':
      emiter.emit('onUIOpSettingMenuSelect', 'changeProject')
      return
    case 'engineUpdate':
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openEngineUpdate)
      return
    case 'about':
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openAbout)
      return
    default:
      return
  }
}

const DeliveryBadge: React.FC<{ item: RenyanMenuItem }> = React.memo(({ item }) => {
  const { t } = useI18nNamespaces(['layout'])
  if (item.deliveryStatus === 'available') return null
  return <span className={styles['delivery-badge']}>{t('Layout.RenyanShell.planned')}</span>
})

export const RenyanNavigation: React.FC<RenyanNavigationProps> = React.memo((props) => {
  const { defaultExpand, onMenuSelect, setRouteToLabel } = props
  const { t, i18n } = useI18nNamespaces(['layout'])
  const menu = useMemo(() => buildRenyanMenu(), [])
  const getTitle = useMenuTitle()
  const [expanded, setExpanded] = useState(defaultExpand)
  const [activeGroupKey, setActiveGroupKey] = useState(menu[0]?.key || '')

  useEffect(() => setExpanded(defaultExpand), [defaultExpand])

  useEffect(() => {
    const labels = new Map<string, string>()
    flattenRenyanMenu(menu).forEach((item) => {
      if (item.route) labels.set(item.route, getTitle(item))
    })
    setRouteToLabel(labels)
  }, [i18n.language, menu, setRouteToLabel])

  useEffect(() => {
    const selectGroup = (event: Event) => setActiveGroupKey((event as CustomEvent<string>).detail)
    window.addEventListener(RENYAN_SHELL_EVENTS.selectNavigationGroup, selectGroup)
    return () => window.removeEventListener(RENYAN_SHELL_EVENTS.selectNavigationGroup, selectGroup)
  }, [])

  const activeGroup = menu.find((item) => item.key === activeGroupKey) || menu[0]
  const selectGroup = (item: RenyanMenuItem) => {
    setActiveGroupKey(item.key)
    window.dispatchEvent(new CustomEvent(RENYAN_SHELL_EVENTS.selectNavigationGroup, { detail: item.key }))
    if (item.route) activateMenuItem(item, onMenuSelect)
  }

  const renderChild = (item: RenyanMenuItem) => (
    <div className={styles['secondary-entry']} key={item.key}>
      <button
        type="button"
        className={classNames(styles['secondary-button'], {
          [styles['menu-button-disabled']]: !isRenyanMenuItemNavigable(item),
        })}
        disabled={!isRenyanMenuItemNavigable(item)}
        data-menu-key={item.key}
        onClick={() => activateMenuItem(item, onMenuSelect)}
      >
        <span>{getTitle(item)}</span>
        <DeliveryBadge item={item} />
        {item.children.length > 0 && <OutlineChevrondownIcon />}
      </button>
      {item.children.length > 0 && (
        <div className={styles['tertiary-navigation']} data-shell-region="tertiary-navigation">
          {item.children.map((child) => (
            <button
              type="button"
              key={child.key}
              disabled={!isRenyanMenuItemNavigable(child)}
              data-menu-key={child.key}
              onClick={() => activateMenuItem(child, onMenuSelect)}
            >
              {getTitle(child)}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <header className={styles['navigation-shell']} data-testid="renyan-navigation">
      <div className={styles['primary-row']}>
        <div className={styles['brand-block']}>
          <span className={styles['brand-mark']}>睿眼</span>
          <span className={styles['brand-caption']}>{t('Layout.RenyanShell.workspace')}</span>
        </div>
        <nav className={styles['primary-navigation']} aria-label={t('Layout.RenyanShell.primaryNavigation')}>
          {menu.map((item, index) => (
            <button
              type="button"
              key={item.key}
              className={classNames(styles['primary-button'], {
                [styles['primary-button-active']]: activeGroup?.key === item.key,
              })}
              data-menu-group={item.key}
              onClick={() => selectGroup(item)}
            >
              <span className={styles['menu-index']}>{String(index + 1).padStart(2, '0')}</span>
              <span>{getTitle(item)}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={styles['navigation-toggle']}
          aria-label={expanded ? t('Layout.RenyanShell.collapseNavigation') : t('Layout.RenyanShell.expandNavigation')}
          data-testid="renyan-navigation-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <OutlineChevrondoubleleftIcon /> : <OutlineChevrondoublerightIcon />}
        </button>
      </div>
      {expanded && (
        <div className={styles['secondary-row']} data-shell-region="secondary-navigation">
          <div className={styles['section-label']}>{getTitle(activeGroup)}</div>
          <div className={styles['secondary-navigation']}>
            {activeGroup.children.length > 0 ? (
              activeGroup.children.map(renderChild)
            ) : (
              <span className={styles['current-workspace']}>{t('Layout.RenyanShell.currentWorkspace')}</span>
            )}
          </div>
        </div>
      )}
    </header>
  )
})

export const RenyanWorkspaceSidebar: React.FC<RenyanWorkspaceSidebarProps> = React.memo((props) => {
  const { currentRoute, onMenuSelect } = props
  const { t } = useI18nNamespaces(['layout'])
  const menu = useMemo(() => buildRenyanMenu(), [])
  const getTitle = useMenuTitle()
  const currentPath = useMemo(() => findRenyanMenuPath(currentRoute || '', menu), [currentRoute, menu])
  const [collapsed, setCollapsed] = useState(false)
  const [activeGroupKey, setActiveGroupKey] = useState(currentPath[0]?.key || menu[0]?.key || '')

  useEffect(() => {
    if (currentPath[0]?.key) setActiveGroupKey(currentPath[0].key)
  }, [currentPath])

  useEffect(() => {
    const selectGroup = (event: Event) => setActiveGroupKey((event as CustomEvent<string>).detail)
    window.addEventListener(RENYAN_SHELL_EVENTS.selectNavigationGroup, selectGroup)
    return () => window.removeEventListener(RENYAN_SHELL_EVENTS.selectNavigationGroup, selectGroup)
  }, [])

  const activeGroup = menu.find((item) => item.key === activeGroupKey) || menu[0]
  const workspaceItems = activeGroup.children.length > 0 ? activeGroup.children : [activeGroup]
  const selectGroup = (item: RenyanMenuItem) => {
    setActiveGroupKey(item.key)
    window.dispatchEvent(new CustomEvent(RENYAN_SHELL_EVENTS.selectNavigationGroup, { detail: item.key }))
    if (item.route) activateMenuItem(item, onMenuSelect)
  }

  return (
    <aside
      className={classNames(styles['workspace-sidebar'], {
        [styles['workspace-sidebar-collapsed']]: collapsed,
      })}
      data-testid="renyan-workspace-sidebar"
    >
      <div className={styles['sidebar-header']}>
        {!collapsed && <span>{t('Layout.RenyanShell.workspaceNavigation')}</span>}
        <button
          type="button"
          aria-label={collapsed ? t('Layout.RenyanShell.expandSidebar') : t('Layout.RenyanShell.collapseSidebar')}
          data-testid="renyan-sidebar-toggle"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <OutlineChevrondoublerightIcon /> : <OutlineChevrondoubleleftIcon />}
        </button>
      </div>
      <nav className={styles['sidebar-groups']} aria-label={t('Layout.RenyanShell.workspaceNavigation')}>
        {menu.map((item, index) => (
          <button
            type="button"
            key={item.key}
            className={classNames(styles['sidebar-group-button'], {
              [styles['sidebar-group-button-active']]: activeGroup.key === item.key,
            })}
            title={getTitle(item)}
            data-sidebar-group={item.key}
            onClick={() => selectGroup(item)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {!collapsed && <strong>{getTitle(item)}</strong>}
          </button>
        ))}
      </nav>
      {!collapsed && (
        <div className={styles['sidebar-context']}>
          <div className={styles['sidebar-context-title']}>{getTitle(activeGroup)}</div>
          <div className={styles['sidebar-items']}>
            {workspaceItems.map((item) => (
              <button
                type="button"
                key={item.key}
                className={classNames(styles['sidebar-item'], {
                  [styles['sidebar-item-active']]: item.route === currentRoute,
                  [styles['menu-button-disabled']]: !isRenyanMenuItemNavigable(item),
                })}
                disabled={!isRenyanMenuItemNavigable(item)}
                data-sidebar-menu-key={item.key}
                onClick={() => activateMenuItem(item, onMenuSelect)}
              >
                <span className={styles['sidebar-item-indicator']} />
                <span>{getTitle(item)}</span>
                <DeliveryBadge item={item} />
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
})
