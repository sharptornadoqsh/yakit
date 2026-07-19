import React, { useEffect, useMemo, useRef, useState } from 'react'
import classNames from 'classnames'
import { isRenyanMenuItemNavigable, type RenyanMenuItem } from '@/routes/renyanMenu'
import productIcon from '@/assets/renyan-icon.svg'
import { RuiYanIcon, type RuiYanIconName } from './RuiYanIcons'
import styles from './RuiYanUI.module.scss'

export interface RuiYanAppShellProps {
  navigation: React.ReactNode
  children: React.ReactNode
}

const RUIYAN_BODY_CLASS = 'ruiyan-workspace-active'

export const RuiYanAppShell: React.FC<RuiYanAppShellProps> = ({ navigation, children }) => {
  useEffect(() => {
    document.body.classList.add(RUIYAN_BODY_CLASS)
    return () => document.body.classList.remove(RUIYAN_BODY_CLASS)
  }, [])

  return (
    <div className={classNames('ruiyan-app-shell', styles['app-shell'])}>
      {navigation}
      <main className={styles['app-main']}>{children}</main>
    </div>
  )
}

export interface RuiYanSearchItem {
  key: string
  title: string
  group: string
}

export interface RuiYanCommand {
  key: string
  label: string
  icon: RuiYanIconName
  onClick: () => void
}

export interface RuiYanTopCommandBarProps {
  productName?: string
  searchItems: readonly RuiYanSearchItem[]
  onSearchSelect: (key: string) => void
  commands: readonly RuiYanCommand[]
  userName: string
  teamName: string
  onNotifications: () => void
  onProfile: () => void
  hasUnreadNotifications?: boolean
}

export const RuiYanTopCommandBar: React.FC<RuiYanTopCommandBarProps> = ({
  productName = '睿眼自动化渗透系统',
  searchItems,
  onSearchSelect,
  commands,
  userName,
  teamName,
  onNotifications,
  onProfile,
  hasUnreadNotifications = false,
}) => {
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return searchItems.slice(0, 8)
    return searchItems
      .filter((item) => `${item.title} ${item.group}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 10)
  }, [query, searchItems])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  const selectResult = (key: string) => {
    onSearchSelect(key)
    setSearchOpen(false)
    setQuery('')
  }

  return (
    <header className={styles['top-bar']}>
      <div className={styles.brand} aria-label={productName}>
        <span className={styles['brand-mark']}>
          <img src={productIcon} alt="" />
        </span>
        <strong className={styles['brand-text']}>{productName}</strong>
      </div>
      <div className={styles['top-search']} role="search">
        <RuiYanIcon name="search" />
        <input
          ref={inputRef}
          value={query}
          role="combobox"
          placeholder="搜索功能、任务或设置"
          aria-label="全局功能搜索"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={searchOpen}
          aria-controls="ruiyan-global-search-results"
          onFocus={() => setSearchOpen(true)}
          onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value)
            setSearchOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSearchOpen(false)
            if (event.key === 'Enter' && results[0]) selectResult(results[0].key)
          }}
        />
        <span className={styles.shortcut}>Ctrl K</span>
        {searchOpen ? (
          <div id="ruiyan-global-search-results" className={styles['search-results']} role="listbox">
            {results.length > 0 ? (
              results.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styles['search-result']}
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectResult(item.key)}
                >
                  <RuiYanIcon name="search" />
                  {item.title}
                  <span>{item.group}</span>
                </button>
              ))
            ) : (
              <div className={styles['search-empty']} role="status">
                未找到匹配功能
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className={styles['top-actions']}>
        {commands.map((command) => (
          <button key={command.key} type="button" className={styles['command-button']} onClick={command.onClick}>
            <RuiYanIcon name={command.icon} />
            <span>{command.label}</span>
          </button>
        ))}
        <button type="button" className={styles['top-icon-button']} aria-label="消息通知" onClick={onNotifications}>
          <RuiYanIcon name="bell" />
          {hasUnreadNotifications ? <span className={styles['notification-dot']} aria-hidden="true" /> : null}
        </button>
        <button type="button" className={styles['profile-button']} aria-label={`账户：${userName}`} onClick={onProfile}>
          <span className={styles.avatar}>
            <RuiYanIcon name="user" />
          </span>
          <span className={styles['profile-text']}>
            <strong>{userName}</strong>
            <span>{teamName}</span>
          </span>
        </button>
      </div>
    </header>
  )
}

const groupIcons: Record<string, RuiYanIconName> = {
  workbench: 'workbench',
  'interactive-proxy': 'proxy',
  'traffic-center': 'traffic',
  'vulnerability-detection': 'vulnerability',
  'brute-force': 'brute',
  'packet-tools': 'packet',
  'plugin-center': 'plugin',
  'team-collaboration': 'team',
  'project-security': 'project',
  'system-settings': 'settings',
}

export const getRuiYanGroupIcon = (key: string): RuiYanIconName => groupIcons[key] || 'panel'

export interface RuiYanPrimaryNavProps {
  groups: readonly RenyanMenuItem[]
  activeGroupKey: string
  onSelect: (item: RenyanMenuItem) => void
}

export const RuiYanPrimaryNav: React.FC<RuiYanPrimaryNavProps> = ({ groups, activeGroupKey, onSelect }) => (
  <nav className={styles['primary-nav']} aria-label="主导航">
    <div className={styles['primary-list']}>
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          className={classNames(styles['primary-item'], group.key === activeGroupKey && styles['primary-active'])}
          aria-current={group.key === activeGroupKey ? 'page' : undefined}
          title={group.title}
          onClick={() => onSelect(group)}
        >
          <RuiYanIcon name={getRuiYanGroupIcon(group.key)} />
          <span>{group.title}</span>
        </button>
      ))}
    </div>
  </nav>
)

export interface RuiYanSecondaryNavProps {
  group: RenyanMenuItem
  activeKeys: readonly string[]
  onSelect: (item: RenyanMenuItem) => void
}

const getItemIcon = (item: RenyanMenuItem): RuiYanIconName => {
  if (item.route) return getRuiYanGroupIcon(item.group)
  if (item.action) return item.action === 'diagnostics' ? 'traffic' : 'settings'
  return 'panel'
}

export const RuiYanSecondaryNav: React.FC<RuiYanSecondaryNavProps> = ({ group, activeKeys, onSelect }) => {
  const items = group.children.filter(isRenyanMenuItemNavigable)
  const headingId = `ruiyan-secondary-heading-${group.key}`

  return (
    <aside className={styles['secondary-nav']} aria-labelledby={headingId}>
      <header className={styles['secondary-header']} id={headingId}>
        <strong>{group.title}</strong>
      </header>
      <div className={styles['secondary-scroll']}>
        <nav className={styles['secondary-list']} aria-label={`${group.title}功能导航`}>
          {items.map((item) => {
            const active = activeKeys.includes(item.key)
            return (
              <button
                key={item.key}
                type="button"
                className={classNames(styles['secondary-item'], active && styles['secondary-active'])}
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(item)}
              >
                <RuiYanIcon name={getItemIcon(item)} />
                <span className={styles['secondary-label']}>{item.title}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
