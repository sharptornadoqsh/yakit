import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { YakitRoute } from '@/enums/yakitRoute'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { useStore } from '@/store'
import { usePageInfo } from '@/store/pageInfo'
import emiter from '@/utils/eventBus/eventBus'
import {
  RENYAN_SHELL_EVENTS,
  RENYAN_SETTINGS_SECTION_STORAGE_KEY,
  RenyanMenuItem,
  buildRenyanMenu,
  findRenyanMenuPath,
  flattenRenyanMenu,
  isRenyanMenuItemNavigable,
} from '@/routes/renyanMenu'
import {
  RuiYanPrimaryNav,
  RuiYanSecondaryNav,
  RuiYanTopCommandBar,
  showRuiYanModal,
  type RuiYanCommand,
} from '@/components/renyanUI'
import SetPassword from '@/pages/SetPassword'

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
    if (item.settingsSection) {
      try {
        window.sessionStorage.setItem(RENYAN_SETTINGS_SECTION_STORAGE_KEY, item.settingsSection)
      } catch (error) {}
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(RENYAN_SHELL_EVENTS.selectSettingsSection, { detail: item.settingsSection }),
        )
      }, 0)
    }
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
      emiter.emit('onUIOpSettingMenuSelect', 'renyan-diagnostics')
      return
    case 'about':
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openAbout)
      return
    default:
      return
  }
}

export const RenyanNavigation: React.FC<RenyanNavigationProps> = React.memo((props) => {
  const { onMenuSelect, setRouteToLabel } = props
  const { i18n } = useI18nNamespaces(['layout'])
  const menu = useMemo(() => buildRenyanMenu(), [])
  const getTitle = useMenuTitle()
  const currentRoute = usePageInfo((state) => state.currentPageTabRouteKey, shallow)
  const userInfo = useStore((state) => state.userInfo)
  const currentPath = useMemo(() => findRenyanMenuPath(currentRoute || '', menu), [currentRoute, menu])
  const [activeGroupKey, setActiveGroupKey] = useState(currentPath[0]?.key || menu[0]?.key || '')
  const [activeSecondaryKey, setActiveSecondaryKey] = useState(currentPath[currentPath.length - 1]?.key || '')

  useEffect(() => {
    if (currentRoute === YakitRoute.Beta_ConfigNetwork) {
      let section: string | null = null
      try {
        section = window.sessionStorage.getItem(RENYAN_SETTINGS_SECTION_STORAGE_KEY)
      } catch (error) {}
      const sectionItem = flattenRenyanMenu(menu).find((item) => item.settingsSection === section)
      if (sectionItem) {
        setActiveGroupKey(sectionItem.group)
        setActiveSecondaryKey(sectionItem.key)
        return
      }
    }

    const selectedItem = flattenRenyanMenu(menu).find((item) => item.key === activeSecondaryKey)
    if (selectedItem?.route === currentRoute) return

    if (currentPath[0]?.key) {
      setActiveGroupKey(currentPath[0].key)
      setActiveSecondaryKey(currentPath[currentPath.length - 1]?.key || '')
    }
  }, [currentPath, currentRoute, menu])

  useEffect(() => {
    const labels = new Map<string, string>()
    flattenRenyanMenu(menu).forEach((item) => {
      if (item.route && !labels.has(item.route)) labels.set(item.route, getTitle(item))
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
  const activeKeys = activeSecondaryKey ? [activeSecondaryKey] : currentPath.map((item) => item.key)

  const selectGroup = (item: RenyanMenuItem) => {
    setActiveGroupKey(item.key)
    window.dispatchEvent(new CustomEvent(RENYAN_SHELL_EVENTS.selectNavigationGroup, { detail: item.key }))
    const target = flattenRenyanMenu([item]).find(isRenyanMenuItemNavigable)
    if (target) {
      setActiveSecondaryKey(target.key)
      activateMenuItem(target, onMenuSelect)
    }
  }

  const selectItem = (item: RenyanMenuItem) => {
    setActiveSecondaryKey(item.key)
    activateMenuItem(item, onMenuSelect)
  }
  const userName = userInfo.githubName || userInfo.wechatName || userInfo.qqName || userInfo.companyName || '本地用户'
  const teamName = userInfo.companyName || '本地工作区'

  const openProfile = () => {
    if (!userInfo.isLogin) {
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openLogin)
      return
    }
    let modal: ReturnType<typeof showRuiYanModal>
    modal = showRuiYanModal({
      title: '账户与密码',
      description: `${userName} · ${teamName}`,
      width: 480,
      closeOnBackdrop: false,
      content: <SetPassword userInfo={userInfo} onCancel={() => modal.destroy()} />,
    })
  }

  const commands: readonly RuiYanCommand[] = [
    {
      key: 'new-task',
      label: '新建任务',
      icon: 'plus',
      onClick: () => onMenuSelect({ route: YakitRoute.BatchExecutorPage }),
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
          if (item) {
            setActiveGroupKey(item.group)
            setActiveSecondaryKey(item.key)
            activateMenuItem(item, onMenuSelect)
          }
        }}
        commands={commands}
        userName={userName}
        teamName={teamName}
        onNotifications={() => emiter.emit('openAllMessageNotification')}
        onProfile={openProfile}
      />
      <RuiYanPrimaryNav groups={menu} activeGroupKey={activeGroup.key} onSelect={selectGroup} />
      <RuiYanSecondaryNav group={activeGroup} activeKeys={activeKeys} onSelect={selectItem} />
    </div>
  )
})
