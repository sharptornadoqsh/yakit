import React from 'react'
import classNames from 'classnames'
import type { YakitSystem } from '@/yakitGVDefine'
import { MacUIOp } from './MacUIOp'
import { WinUIOp } from './WinUIOp'
import styles from './uiLayout.module.scss'

export interface RenyanWindowChromeProps {
  system?: YakitSystem
  currentProjectId: string
  pageChildrenShow: boolean
  draggable: boolean
  onToggleWindowSize: () => void
}

export const RenyanWindowChrome: React.FC<RenyanWindowChromeProps> = React.memo((props) => {
  const { system, currentProjectId, pageChildrenShow, draggable, onToggleWindowSize } = props
  const windowControlProps = { currentProjectId, pageChildrenShow }

  return (
    <div className={classNames(styles['header-body'], styles['renyan-window-chrome'])}>
      {system === 'Darwin' ? <MacUIOp {...windowControlProps} /> : null}
      <div
        className={classNames(styles['header-title'], { [styles['header-title-drop']]: draggable })}
        data-testid="renyan-window-drag-region"
        onDoubleClick={onToggleWindowSize}
      />
      {system !== 'Darwin' ? <WinUIOp {...windowControlProps} /> : null}
    </div>
  )
})
