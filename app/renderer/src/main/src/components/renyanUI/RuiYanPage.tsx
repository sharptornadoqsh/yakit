import React from 'react'
import { YakitRoute } from '@/enums/yakitRoute'
import { getRuiYanRouteVisual, RuiYanVisualProvider } from './RuiYanVisualContext'
import styles from './RuiYanPage.module.scss'

interface RuiYanPageProps {
  route: YakitRoute | string
  children: React.ReactNode
}

export const RuiYanPage: React.FC<RuiYanPageProps> = React.memo(({ route, children }) => {
  const visual = getRuiYanRouteVisual(route)
  if (!visual) return <>{children}</>

  return (
    <RuiYanVisualProvider route={route}>
      <div className={styles['ruiyan-page']} data-ruiyan-layout={visual.layout} data-ruiyan-route={route}>
        {children}
      </div>
    </RuiYanVisualProvider>
  )
})
