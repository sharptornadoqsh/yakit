import React from 'react'
import type { Theme } from '@/hooks/useTheme'
import renyanIcon from '@/assets/renyan-icon.svg'
import { productConfig } from '@/config/product'
import styles from './StartupSplash.module.scss'

interface StartupSplashProps {
  theme: Theme
}

export const StartupSplash: React.FC<StartupSplashProps> = React.memo(({ theme }) => {
  return (
    <section className={styles['startup-splash']} data-theme={theme} role="status" aria-live="polite">
      <div className={styles['brand-icon']} aria-hidden="true">
        <img src={renyanIcon} alt="" />
      </div>
      <div className={styles['brand-name']}>{productConfig.shortName}</div>
      <h1>睿眼自动化渗透系统正在启动</h1>
      <div className={styles['startup-indicator']} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  )
})
