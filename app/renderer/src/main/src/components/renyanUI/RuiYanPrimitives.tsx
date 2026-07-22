import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import classNames from 'classnames'
import { ConfigProvider } from 'antd'
import { RuiYanIcon, type RuiYanIconName } from './RuiYanIcons'
import styles from './RuiYanUI.module.scss'

export type RuiYanButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type RuiYanButtonSize = 'small' | 'medium' | 'large'

export interface RuiYanButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: RuiYanButtonVariant
  size?: RuiYanButtonSize
  icon?: React.ReactNode
  loading?: boolean
}

export const RuiYanButton = React.forwardRef<HTMLButtonElement, RuiYanButtonProps>(
  ({ variant = 'secondary', size = 'medium', icon, loading, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={classNames(styles.button, styles[`button-${variant}`], styles[`button-${size}`], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <RuiYanIcon name="loading" className={styles.spinner} /> : icon}
      {children}
    </button>
  ),
)
RuiYanButton.displayName = 'RuiYanButton'

export interface RuiYanIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  label: string
}

export const RuiYanIconButton = React.forwardRef<HTMLButtonElement, RuiYanIconButtonProps>(
  ({ icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={classNames(styles['icon-button'], className)}
      aria-label={label}
      {...props}
    >
      {icon}
    </button>
  ),
)
RuiYanIconButton.displayName = 'RuiYanIconButton'

export interface RuiYanCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export const RuiYanCard: React.FC<RuiYanCardProps> = ({ interactive, className, ...props }) => (
  <section className={classNames(styles.card, interactive && styles['card-interactive'], className)} {...props} />
)

export interface RuiYanPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  extra?: React.ReactNode
  bodyClassName?: string
}

export const RuiYanPanel: React.FC<RuiYanPanelProps> = ({
  title,
  extra,
  bodyClassName,
  className,
  children,
  ...props
}) => (
  <section className={classNames(styles.panel, className)} {...props}>
    {title || extra ? (
      <header className={styles['panel-header']}>
        <h2 className={styles['panel-title']}>{title}</h2>
        {extra}
      </header>
    ) : null}
    <div className={classNames(styles['panel-body'], bodyClassName)}>{children}</div>
  </section>
)

export interface RuiYanSplitPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  first: React.ReactNode
  second: React.ReactNode
  direction?: 'horizontal' | 'vertical'
  firstSize?: string
}

export const RuiYanSplitPane: React.FC<RuiYanSplitPaneProps> = ({
  first,
  second,
  direction = 'horizontal',
  firstSize = '36%',
  className,
  style,
  ...props
}) => (
  <div
    className={classNames(styles['split-pane'], styles[`split-${direction}`], className)}
    style={{ ...style, '--ruiyan-split-first': firstSize } as React.CSSProperties}
    {...props}
  >
    <div className={styles['split-node']}>{first}</div>
    <div className={styles['split-node']}>{second}</div>
  </div>
)

export interface RuiYanTableColumn<T> {
  key: string
  title: React.ReactNode
  width?: number | string
  align?: 'left' | 'center' | 'right'
  render: (record: T, index: number) => React.ReactNode
}

export interface RuiYanPermissionColumn {
  key: string
  label: React.ReactNode
}

export interface RuiYanPermissionRow {
  key: string
  label: React.ReactNode
  description?: React.ReactNode
  values: Readonly<Record<string, boolean | null | undefined>>
}

export interface RuiYanPermissionMatrixProps {
  columns: readonly RuiYanPermissionColumn[]
  rows: readonly RuiYanPermissionRow[]
  onChange?: (rowKey: string, columnKey: string, checked: boolean) => void
  emptyTitle?: string
  className?: string
}

export const RuiYanPermissionMatrix: React.FC<RuiYanPermissionMatrixProps> = ({
  columns,
  rows,
  onChange,
  emptyTitle = '暂无权限数据',
  className,
}) => {
  if (rows.length === 0) return <RuiYanEmptyState compact title={emptyTitle} />

  return (
    <div className={classNames(styles['permission-matrix-wrap'], className)}>
      <table className={styles['permission-matrix']}>
        <thead>
          <tr>
            <th scope="col">权限模块</th>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                <strong>{row.label}</strong>
                {row.description ? <span>{row.description}</span> : null}
              </th>
              {columns.map((column) => {
                const value = row.values[column.key]
                if (value === null || value === undefined) {
                  return (
                    <td key={column.key}>
                      <span className={styles['permission-unavailable']} aria-label="不适用">
                        —
                      </span>
                    </td>
                  )
                }
                return (
                  <td key={column.key}>
                    <label className={styles['permission-cell']}>
                      <input
                        type="checkbox"
                        checked={value}
                        disabled={!onChange}
                        aria-label={`${String(row.label)} ${String(column.label)}`}
                        onChange={(event) => onChange?.(row.key, column.key, event.target.checked)}
                      />
                      <span aria-hidden="true" />
                    </label>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface RuiYanDataTableProps<T> {
  columns: readonly RuiYanTableColumn<T>[]
  data: readonly T[]
  rowKey: keyof T | ((record: T, index: number) => React.Key)
  compact?: boolean
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  onRowClick?: (record: T) => void
}

export const RuiYanDataTable = <T,>({
  columns,
  data,
  rowKey,
  compact,
  loading,
  emptyTitle = '暂无数据',
  emptyDescription = '当前筛选条件下没有可展示的真实记录。',
  className,
  onRowClick,
}: RuiYanDataTableProps<T>) => {
  const getRowKey = (record: T, index: number) =>
    typeof rowKey === 'function' ? rowKey(record, index) : String(record[rowKey] ?? index)

  if (loading) return <RuiYanLoadingState title="数据读取中" description="正在读取当前业务数据。" />
  if (data.length === 0) return <RuiYanEmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <div className={classNames(styles['table-wrap'], className)}>
      <table className={classNames(styles.table, compact && styles['table-compact'])}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ width: column.width, textAlign: column.align }} scope="col">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((record, index) => (
            <tr
              key={getRowKey(record, index)}
              onClick={onRowClick ? () => onRowClick(record) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        if (event.key === ' ') event.preventDefault()
                        onRowClick(record)
                      }
                    }
                  : undefined
              }
            >
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align }}>
                  {column.render(record, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface RuiYanFilterPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  extra?: React.ReactNode
}

export const RuiYanFilterPanel: React.FC<RuiYanFilterPanelProps> = ({
  title = '筛选条件',
  extra,
  className,
  children,
  ...props
}) => (
  <aside className={classNames(styles['filter-panel'], className)} {...props}>
    <header className={styles['filter-header']}>
      <h2 className={styles['filter-title']}>{title}</h2>
      {extra}
    </header>
    <div className={styles['filter-body']}>{children}</div>
  </aside>
)

export interface RuiYanTabItem {
  key: string
  label: React.ReactNode
  content: React.ReactNode
  disabled?: boolean
}

export interface RuiYanBreadcrumbItem {
  key: string
  label: React.ReactNode
  onClick?: () => void
}

export interface RuiYanBreadcrumbProps {
  items: readonly RuiYanBreadcrumbItem[]
  className?: string
  label?: string
}

export const RuiYanBreadcrumb: React.FC<RuiYanBreadcrumbProps> = ({ items, className, label = '当前位置' }) => (
  <nav className={classNames(styles.breadcrumb, className)} aria-label={label}>
    <ol>
      {items.map((item, index) => {
        const current = index === items.length - 1
        return (
          <li key={item.key}>
            {item.onClick && !current ? (
              <button type="button" onClick={item.onClick}>
                {item.label}
              </button>
            ) : (
              <span aria-current={current ? 'page' : undefined}>{item.label}</span>
            )}
          </li>
        )
      })}
    </ol>
  </nav>
)

export interface RuiYanSegmentedItem {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface RuiYanSegmentedProps {
  items: readonly RuiYanSegmentedItem[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  className?: string
  label?: string
}

export const RuiYanSegmented: React.FC<RuiYanSegmentedProps> = ({
  items,
  value,
  defaultValue,
  onChange,
  className,
  label = '视图切换',
}) => {
  const firstAvailable = items.find((item) => !item.disabled)?.value || ''
  const [innerValue, setInnerValue] = useState(defaultValue || firstAvailable)
  const selectedValue = items.some((item) => item.value === value && !item.disabled)
    ? value
    : items.some((item) => item.value === innerValue && !item.disabled)
      ? innerValue
      : firstAvailable

  const selectItem = (nextValue: string) => {
    if (value === undefined) setInnerValue(nextValue)
    onChange?.(nextValue)
  }

  return (
    <div className={classNames(styles.segmented, className)} role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          className={classNames(styles['segmented-item'], item.value === selectedValue && styles['segmented-active'])}
          aria-checked={item.value === selectedValue}
          disabled={item.disabled}
          onClick={() => selectItem(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export interface RuiYanTabsProps {
  items: readonly RuiYanTabItem[]
  activeKey?: string
  defaultActiveKey?: string
  onChange?: (key: string) => void
  className?: string
}

export const RuiYanTabs: React.FC<RuiYanTabsProps> = ({ items, activeKey, defaultActiveKey, onChange, className }) => {
  const firstAvailable = items.find((item) => !item.disabled)?.key || ''
  const [innerActiveKey, setInnerActiveKey] = useState(defaultActiveKey || firstAvailable)
  const selectedKey = activeKey ?? innerActiveKey
  const selected =
    items.find((item) => item.key === selectedKey && !item.disabled) || items.find((item) => !item.disabled)
  const id = useId()

  const selectTab = (key: string) => {
    if (activeKey === undefined) setInnerActiveKey(key)
    onChange?.(key)
  }

  const moveFocus = (currentKey: string, direction: 'previous' | 'next' | 'first' | 'last') => {
    const enabledItems = items.filter((item) => !item.disabled)
    if (enabledItems.length === 0) return
    const currentIndex = enabledItems.findIndex((item) => item.key === currentKey)
    const nextIndex =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? enabledItems.length - 1
          : direction === 'next'
            ? (currentIndex + 1) % enabledItems.length
            : (currentIndex - 1 + enabledItems.length) % enabledItems.length
    const nextItem = enabledItems[nextIndex]
    selectTab(nextItem.key)
    document.getElementById(`${id}-${nextItem.key}-tab`)?.focus()
  }

  return (
    <div className={classNames(styles.tabs, className)}>
      <div className={styles['tab-list']} role="tablist">
        {items.map((item) => {
          const isActive = item.key === selected?.key
          return (
            <button
              key={item.key}
              id={`${id}-${item.key}-tab`}
              type="button"
              role="tab"
              className={classNames(styles.tab, isActive && styles['tab-active'])}
              aria-selected={isActive}
              aria-controls={`${id}-${item.key}-panel`}
              tabIndex={isActive ? 0 : -1}
              disabled={item.disabled}
              onClick={() => selectTab(item.key)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  moveFocus(item.key, 'next')
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  moveFocus(item.key, 'previous')
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  moveFocus(item.key, 'first')
                } else if (event.key === 'End') {
                  event.preventDefault()
                  moveFocus(item.key, 'last')
                }
              }}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {selected ? (
        <div
          id={`${id}-${selected.key}-panel`}
          className={styles['tab-panel']}
          role="tabpanel"
          aria-labelledby={`${id}-${selected.key}-tab`}
        >
          {selected.content}
        </div>
      ) : null}
    </div>
  )
}

export type RuiYanStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface RuiYanStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: RuiYanStatusTone
}

export const RuiYanStatusBadge: React.FC<RuiYanStatusBadgeProps> = ({ tone = 'neutral', className, ...props }) => (
  <span className={classNames(styles['status-badge'], styles[`status-${tone}`], className)} {...props} />
)

export interface RuiYanMetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
}

export const RuiYanMetricCard: React.FC<RuiYanMetricCardProps> = ({
  label,
  value,
  hint,
  icon,
  className,
  ...props
}) => (
  <article className={classNames(styles['metric-card'], className)} {...props}>
    <span className={styles['metric-icon']}>{icon || <RuiYanIcon name="panel" />}</span>
    <div className={styles['metric-content']}>
      <span className={styles['metric-label']}>{label}</span>
      <strong className={styles['metric-value']}>{value}</strong>
      {hint ? <span className={styles['metric-hint']}>{hint}</span> : null}
    </div>
  </article>
)

interface RuiYanStateProps {
  type: 'empty' | 'loading' | 'error'
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: RuiYanIconName
  className?: string
  compact?: boolean
}

const RuiYanState: React.FC<RuiYanStateProps> = ({ type, title, description, action, icon, className, compact }) => (
  <div
    className={classNames(styles.state, styles[`state-${type}`], compact && styles['state-compact'], className)}
    role={type === 'error' ? 'alert' : 'status'}
  >
    <div className={styles['state-inner']}>
      <span className={styles['state-icon']}>
        <RuiYanIcon name={icon || type} className={type === 'loading' ? styles.spinner : undefined} />
      </span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className={styles['state-action']}>{action}</div> : null}
    </div>
  </div>
)

export type RuiYanStateComponentProps = Omit<RuiYanStateProps, 'type'>

export const RuiYanEmptyState: React.FC<RuiYanStateComponentProps> = (props) => <RuiYanState type="empty" {...props} />
export const RuiYanLoadingState: React.FC<RuiYanStateComponentProps> = (props) => (
  <RuiYanState type="loading" {...props} />
)
export const RuiYanErrorState: React.FC<RuiYanStateComponentProps> = (props) => <RuiYanState type="error" {...props} />

interface RuiYanOverlayProps {
  open: boolean
  title: React.ReactNode
  description?: React.ReactNode
  onClose: () => void
  closable?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  navigation?: React.ReactNode
  bodyClassName?: string
  closeOnBackdrop?: boolean
  kind: 'dialog' | 'drawer'
  width: number
}

const RuiYanOverlay: React.FC<RuiYanOverlayProps> = ({
  open,
  title,
  description,
  onClose,
  closable = true,
  children,
  footer,
  navigation,
  bodyClassName,
  closeOnBackdrop = true,
  kind,
  width,
}) => {
  const titleId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    containerRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closable) onClose()
      if (event.key !== 'Tab' || !containerRef.current) return
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        containerRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === containerRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    }
  }, [open, onClose, closable])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={classNames(styles.overlay, kind === 'drawer' && styles['drawer-overlay'])}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <ConfigProvider getPopupContainer={() => containerRef.current || document.body}>
        <div
          ref={containerRef}
          className={styles[kind]}
          style={width ? { width } : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className={styles[`${kind}-header`]}>
            <div className={styles['overlay-heading']}>
              <h2 id={titleId}>{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            {closable ? <RuiYanIconButton icon={<RuiYanIcon name="close" />} label="关闭" onClick={onClose} /> : null}
          </header>
          <div className={classNames(styles['overlay-content'], navigation && styles['overlay-content-split'])}>
            {navigation ? <aside className={styles['overlay-navigation']}>{navigation}</aside> : null}
            <div className={classNames(styles[`${kind}-body`], bodyClassName)}>{children}</div>
          </div>
          {footer ? <footer className={styles[`${kind}-footer`]}>{footer}</footer> : null}
        </div>
      </ConfigProvider>
    </div>,
    document.body,
  )
}

export type RuiYanModalWidth = 480 | 720 | 960

export interface RuiYanModalProps extends Omit<RuiYanOverlayProps, 'kind' | 'width'> {
  width?: RuiYanModalWidth
}

export const RuiYanModal: React.FC<RuiYanModalProps> = ({ width = 720, ...props }) => (
  <RuiYanOverlay kind="dialog" width={width} {...props} />
)

export interface ShowRuiYanModalOptions {
  title: React.ReactNode
  description?: React.ReactNode
  content: React.ReactNode
  footer?: React.ReactNode
  width?: RuiYanModalWidth
  closable?: boolean
  closeOnBackdrop?: boolean
  onClose?: () => void
  onConfirm?: () => void
  confirmText?: React.ReactNode
  cancelText?: React.ReactNode
}

export interface RuiYanModalHandle {
  destroy: () => void
}

export const showRuiYanModal = (options: ShowRuiYanModalOptions): RuiYanModalHandle => {
  if (typeof document === 'undefined') return { destroy: () => {} }

  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let destroyed = false
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    root.unmount()
    host.remove()
  }
  const onClose = () => {
    options.onClose?.()
    destroy()
  }
  const footer = Object.prototype.hasOwnProperty.call(options, 'footer') ? (
    options.footer
  ) : options.onConfirm ? (
    <>
      <RuiYanButton variant="secondary" onClick={onClose}>
        {options.cancelText || '取消'}
      </RuiYanButton>
      <RuiYanButton onClick={options.onConfirm}>{options.confirmText || '确认'}</RuiYanButton>
    </>
  ) : undefined

  root.render(
    <RuiYanModal
      open={true}
      title={options.title}
      description={options.description}
      onClose={onClose}
      footer={footer}
      width={options.width}
      closable={options.closable}
      closeOnBackdrop={options.closeOnBackdrop}
    >
      {options.content}
    </RuiYanModal>,
  )

  return { destroy }
}

export type RuiYanDrawerWidth = 480 | 640

export interface RuiYanDrawerProps extends Omit<RuiYanOverlayProps, 'kind' | 'width'> {
  width?: RuiYanDrawerWidth
}

export const RuiYanDrawer: React.FC<RuiYanDrawerProps> = ({ width = 640, ...props }) => (
  <RuiYanOverlay kind="drawer" width={width} {...props} />
)

export interface RuiYanConfirmDialogProps extends Omit<RuiYanModalProps, 'children' | 'footer' | 'onClose' | 'width'> {
  message: React.ReactNode
  confirmText?: React.ReactNode
  cancelText?: React.ReactNode
  danger?: boolean
  confirmLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const RuiYanConfirmDialog: React.FC<RuiYanConfirmDialogProps> = ({
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  confirmLoading,
  onConfirm,
  onCancel,
  ...props
}) => (
  <RuiYanModal
    {...props}
    width={480}
    onClose={onCancel}
    footer={
      <div className={styles['confirm-actions']}>
        {danger ? (
          <RuiYanButton
            variant="ghost"
            className={styles['confirm-danger']}
            loading={confirmLoading}
            onClick={onConfirm}
          >
            {confirmText}
          </RuiYanButton>
        ) : null}
        <span className={styles['confirm-spacer']} />
        <RuiYanButton variant="secondary" onClick={onCancel}>
          {cancelText}
        </RuiYanButton>
        {!danger ? (
          <RuiYanButton variant="primary" loading={confirmLoading} onClick={onConfirm}>
            {confirmText}
          </RuiYanButton>
        ) : null}
      </div>
    }
  >
    <div className={styles['confirm-message']}>{message}</div>
  </RuiYanModal>
)

export interface RuiYanFormSectionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  extra?: React.ReactNode
}

export const RuiYanFormSection: React.FC<RuiYanFormSectionProps> = ({
  title,
  description,
  extra,
  className,
  children,
  ...props
}) => (
  <section className={classNames(styles['form-section'], className)} {...props}>
    <header className={styles['form-header']}>
      <div>
        <h2 className={styles['form-title']}>{title}</h2>
        {description ? <span>{description}</span> : null}
      </div>
      {extra}
    </header>
    <div className={styles['form-body']}>{children}</div>
  </section>
)

export interface RuiYanDetailPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  extra?: React.ReactNode
}

export interface RuiYanCodeEditorFrameProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  toolbar?: React.ReactNode
  status?: React.ReactNode
}

export const RuiYanCodeEditorFrame: React.FC<RuiYanCodeEditorFrameProps> = ({
  title,
  description,
  toolbar,
  status,
  className,
  children,
  ...props
}) => (
  <section className={classNames(styles['code-editor-frame'], className)} {...props}>
    <header className={styles['code-editor-header']}>
      <div>
        <h2>{title}</h2>
        {description ? <span>{description}</span> : null}
      </div>
      {toolbar ? <div className={styles['code-editor-toolbar']}>{toolbar}</div> : null}
    </header>
    <div className={styles['code-editor-body']}>{children}</div>
    {status ? <footer className={styles['code-editor-status']}>{status}</footer> : null}
  </section>
)

export const RuiYanDetailPanel: React.FC<RuiYanDetailPanelProps> = ({
  title,
  extra,
  className,
  children,
  ...props
}) => (
  <aside className={classNames(styles['detail-panel'], className)} {...props}>
    <header className={styles['detail-header']}>
      <h2 className={styles['detail-title']}>{title}</h2>
      {extra}
    </header>
    <div className={styles['detail-body']}>{children}</div>
  </aside>
)

export interface RuiYanPageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
}

export const RuiYanPageHeader: React.FC<RuiYanPageHeaderProps> = ({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...props
}) => (
  <header className={classNames(styles['page-header'], className)} {...props}>
    <div className={styles['page-heading']}>
      {eyebrow ? <span className={styles['page-eyebrow']}>{eyebrow}</span> : null}
      <div className={styles['page-title-group']}>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
    {actions ? <div className={styles['page-actions']}>{actions}</div> : null}
  </header>
)

export interface RuiYanToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode
  actions?: React.ReactNode
}

export const RuiYanToolbar: React.FC<RuiYanToolbarProps> = ({ leading, actions, className, children, ...props }) => (
  <div className={classNames(styles.toolbar, className)} role="toolbar" {...props}>
    <div className={styles['toolbar-leading']}>{leading || children}</div>
    {actions ? <div className={styles['toolbar-actions']}>{actions}</div> : null}
  </div>
)

export const RuiYanPageFrame: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={classNames(styles.page, className)} {...props} />
)
