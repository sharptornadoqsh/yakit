import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { YakitRoute } from '@/enums/yakitRoute'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { useStore } from '@/store'
import { usePageInfo } from '@/store/pageInfo'
import emiter from '@/utils/eventBus/eventBus'
import {
  RENYAN_SHELL_EVENTS,
  RenyanMenuItem,
  buildRenyanMenu,
  findRenyanMenuPath,
  flattenRenyanMenu,
  isRenyanMenuItemNavigable,
} from '@/routes/renyanMenu'
import { RuiYanPrimaryNav, RuiYanSecondaryNav, RuiYanTopCommandBar, type RuiYanCommand } from '@/components/renyanUI'

interface RenyanRouteSelection {
  route: YakitRoute
}

export interface RenyanNavigationProps {
  defaultExpand: boolean
  onMenuSelect: (route: RenyanRouteSelection) => void
  setRouteToLabel: (data: Map<string, string>) => void
}

const useMenuTitle = () => {
  const { t } = useI18nNamespaces(['layout'])
  return useCallback(
    (item: RenyanMenuItem) => {
      const translated = t(item.titleKey)
      return translated === item.titleKey ? item.title : translated
    },
    [t],
  )
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
    case 'serviceConnection':
      emiter.emit('onUIOpSettingMenuSelect', 'store')
      return
    case 'engineUpdate':
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openEngineUpdate)
      return
    case 'diagnostics':
      emiter.emit('onUIOpSettingMenuSelect', 'engineLog')
      return
    case 'about':
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openAbout)
      return
    default:
      return
  }
}

export const RenyanNavigation: React.FC<RenyanNavigationProps> = React.memo((props) => {
  const { defaultExpand, onMenuSelect, setRouteToLabel } = props
  const { i18n } = useI18nNamespaces(['layout'])
  const menu = useMemo(() => buildRenyanMenu(), [])
  const getTitle = useMenuTitle()
  const currentRoute = usePageInfo((state) => state.currentPageTabRouteKey, shallow)
  const userInfo = useStore((state) => state.userInfo)
  const currentPath = useMemo(() => findRenyanMenuPath(currentRoute || '', menu), [currentRoute, menu])
  const [activeGroupKey, setActiveGroupKey] = useState(currentPath[0]?.key || menu[0]?.key || '')

  useEffect(() => {
    if (currentPath[0]?.key) setActiveGroupKey(currentPath[0].key)
  }, [currentPath])

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
  const navigableItems = useMemo(() => flattenRenyanMenu(menu).filter(isRenyanMenuItemNavigable), [menu])
  const activeKeys = currentPath.map((item) => item.key)

  const selectGroup = (item: RenyanMenuItem) => {
    setActiveGroupKey(item.key)
    window.dispatchEvent(new CustomEvent(RENYAN_SHELL_EVENTS.selectNavigationGroup, { detail: item.key }))
    const target = flattenRenyanMenu([item]).find((entry) => entry.route && isRenyanMenuItemNavigable(entry))
    if (target) activateMenuItem(target, onMenuSelect)
  }

  const selectItem = (item: RenyanMenuItem) => activateMenuItem(item, onMenuSelect)
  const userName = userInfo.githubName || userInfo.wechatName || userInfo.qqName || userInfo.companyName || '本地用户'
  const teamName = userInfo.companyName || '本地工作区'

  const commands: readonly RuiYanCommand[] = [
    {
      key: 'new-task',
      label: '新建任务',
      icon: 'plus',
      onClick: () => onMenuSelect({ route: YakitRoute.BatchExecutorPage }),
    },
    {
      key: 'quick-replay',
      label: '快速重放',
      icon: 'replay',
      onClick: () => onMenuSelect({ route: YakitRoute.HTTPFuzzer }),
    },
    {
      key: 'environment',
      label: '环境管理',
      icon: 'environment',
      onClick: () => emiter.emit('onUIOpSettingMenuSelect', 'store'),
    },
  ]

  return (
    <div style={{ display: 'contents' }} data-testid="renyan-navigation">
      <RuiYanTopCommandBar
        searchItems={navigableItems.map((item) => ({
          key: item.key,
          title: getTitle(item),
          group: getTitle(menu.find((group) => group.key === item.group) || activeGroup),
        }))}
        onSearchSelect={(key) => {
          const item = navigableItems.find((entry) => entry.key === key)
          if (item) activateMenuItem(item, onMenuSelect)
        }}
        commands={commands}
        userName={userName}
        teamName={teamName}
        onNotifications={() => emiter.emit('openAllMessageNotification')}
        onProfile={() => onMenuSelect({ route: YakitRoute.AccountAdminPage })}
      />
      <RuiYanPrimaryNav groups={menu} activeGroupKey={activeGroup.key} onSelect={selectGroup} />
      <RuiYanSecondaryNav
        group={activeGroup}
        activeKeys={activeKeys}
        defaultCollapsed={!defaultExpand}
        onSelect={selectItem}
      />
    </div>
  )
})
