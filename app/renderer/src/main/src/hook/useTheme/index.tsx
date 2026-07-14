import { create } from 'zustand'
import { yakitTheme } from '@/services/electronBridge'

export type Theme = 'light' | 'dark'

const renyanThemeTokens: Record<Theme, Record<string, string>> = {
  light: {
    '--renyan-shell-primary': '#315efb',
    '--renyan-success-primary': '#16b89a',
    '--renyan-success-border': 'color-mix(in srgb, #16b89a 40%, transparent)',
    '--renyan-success-bg': 'color-mix(in srgb, #16b89a 10%, transparent)',
    '--renyan-warning-primary': '#c88918',
    '--renyan-error-primary': '#e5484d',
    '--Colors-Use-Main-Bg': '#edf2ff',
    '--Colors-Use-Main-Focus': 'rgb(49 94 251 / 20%)',
    '--Colors-Use-Main-Border': '#9db2ff',
    '--Colors-Use-Main-Hover': '#4b72ff',
    '--Colors-Use-Main-Primary': '#315efb',
    '--Colors-Use-Main-Pressed': '#2448c7',
    '--Colors-Use-Main-On-Primary': '#ffffff',
    '--Colors-Use-Success-Bg': '#e8f8f4',
    '--Colors-Use-Success-Focus': 'rgb(22 184 154 / 18%)',
    '--Colors-Use-Success-Border': '#87d9c8',
    '--Colors-Use-Success-Hover': '#20c7a7',
    '--Colors-Use-Success-Primary': '#148f7a',
    '--Colors-Use-Success-Pressed': '#0e6f60',
    '--Colors-Use-Warning-Bg': '#fff6df',
    '--Colors-Use-Warning-Focus': 'rgb(200 137 24 / 18%)',
    '--Colors-Use-Warning-Border': '#e4c47f',
    '--Colors-Use-Warning-Hover': '#d99b2c',
    '--Colors-Use-Warning-Primary': '#a66e0d',
    '--Colors-Use-Warning-Pressed': '#805309',
    '--Colors-Use-Error-Bg': '#fff0f0',
    '--Colors-Use-Error-Focus': 'rgb(229 72 77 / 18%)',
    '--Colors-Use-Error-Border': '#f0a1a4',
    '--Colors-Use-Error-Hover': '#ef5f64',
    '--Colors-Use-Error-Primary': '#c9363b',
    '--Colors-Use-Error-Pressed': '#a2262b',
  },
  dark: {
    '--renyan-shell-primary': '#7291ff',
    '--renyan-success-primary': '#45d6bb',
    '--renyan-success-border': 'color-mix(in srgb, #45d6bb 42%, transparent)',
    '--renyan-success-bg': 'color-mix(in srgb, #45d6bb 12%, transparent)',
    '--renyan-warning-primary': '#f0b955',
    '--renyan-error-primary': '#ff7175',
    '--Colors-Use-Main-Bg': '#182340',
    '--Colors-Use-Main-Focus': 'rgb(114 145 255 / 24%)',
    '--Colors-Use-Main-Border': '#405aaf',
    '--Colors-Use-Main-Hover': '#8aa3ff',
    '--Colors-Use-Main-Primary': '#7291ff',
    '--Colors-Use-Main-Pressed': '#5676e7',
    '--Colors-Use-Main-On-Primary': '#0c1326',
    '--Colors-Use-Success-Bg': '#112e2a',
    '--Colors-Use-Success-Focus': 'rgb(69 214 187 / 22%)',
    '--Colors-Use-Success-Border': '#267e70',
    '--Colors-Use-Success-Hover': '#62e2ca',
    '--Colors-Use-Success-Primary': '#45d6bb',
    '--Colors-Use-Success-Pressed': '#2fb69f',
    '--Colors-Use-Warning-Bg': '#352812',
    '--Colors-Use-Warning-Focus': 'rgb(240 185 85 / 22%)',
    '--Colors-Use-Warning-Border': '#8f6722',
    '--Colors-Use-Warning-Hover': '#f7c66e',
    '--Colors-Use-Warning-Primary': '#f0b955',
    '--Colors-Use-Warning-Pressed': '#cf9636',
    '--Colors-Use-Error-Bg': '#37191c',
    '--Colors-Use-Error-Focus': 'rgb(255 113 117 / 22%)',
    '--Colors-Use-Error-Border': '#914148',
    '--Colors-Use-Error-Hover': '#ff8f92',
    '--Colors-Use-Error-Primary': '#ff7175',
    '--Colors-Use-Error-Pressed': '#dc5258',
  },
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  Object.entries(renyanThemeTokens[theme]).forEach(([token, value]) => {
    document.documentElement.style.setProperty(token, value)
  })
  localStorage.setItem('theme', theme)
}

export const useTheme = create<{
  theme: Theme
  setTheme: (theme: Theme) => void
  /** 来自主进程 yakit-app-sync 广播，不再走 IPC */
  syncTheme: (theme: Theme) => void
}>((set) => {
  const initialTheme: Theme = (localStorage.getItem('theme') as Theme) || 'light'
  applyTheme(initialTheme)

  return {
    theme: initialTheme,
    syncTheme: (theme: Theme) => {
      applyTheme(theme)
      set({ theme })
    },
    setTheme: (theme: Theme) => {
      applyTheme(theme)
      set({ theme })
      yakitTheme.setTheme(theme)
    },
  }
})
