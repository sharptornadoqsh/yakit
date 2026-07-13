import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  class TrayMock {
    constructor(icon) {
      this.icon = icon
      this.destroyed = false
    }

    isDestroyed() {
      return this.destroyed
    }

    setToolTip(value) {
      this.tooltip = value
    }

    setContextMenu(value) {
      this.menu = value
    }

    on(event, callback) {
      this[event] = callback
    }

    destroy() {
      this.destroyed = true
    }
  }

  return {
    buildFromTemplate: vi.fn((template) => template),
    createFromPath: vi.fn(() => ({ setTemplateImage: vi.fn() })),
    TrayMock,
  }
})

import { createMenuTemplate } from '../menu'
import { createProductTray, destroyProductTray } from '../tray'
import productSource from '../../../product/renyan.json'

describe('产品菜单与托盘', () => {
  beforeEach(() => {
    destroyProductTray()
    vi.clearAllMocks()
  })

  it('提供规定的托盘操作并显示产品名称', () => {
    const callbacks = {
      showMainWindow: vi.fn(),
      hideWindows: vi.fn(),
      openLogDirectory: vi.fn(),
      showAbout: vi.fn(),
      quitApplication: vi.fn(),
    }
    const tray = createProductTray(callbacks, {
      Menu: { buildFromTemplate: electronMocks.buildFromTemplate },
      nativeImage: { createFromPath: electronMocks.createFromPath },
      Tray: electronMocks.TrayMock,
    })

    expect(tray.tooltip).toBe(productSource.displayName)
    expect(tray.menu.filter((item) => item.label).map((item) => item.label)).toEqual([
      '显示主窗口',
      '隐藏',
      '打开日志目录',
      '关于',
      '退出',
    ])
    tray.menu[0].click()
    expect(callbacks.showMainWindow).toHaveBeenCalledOnce()
  })

  it('系统菜单包含产品关于入口和受控外部链接', () => {
    const showAbout = vi.fn()
    const menu = createMenuTemplate({ showAbout })
    const helpMenu = menu.find((item) => item.role === 'help')

    expect(helpMenu.submenu[0].label).toBe(`关于 ${productSource.displayName}`)
    expect(helpMenu.submenu.map((item) => item.label).filter(Boolean)).toEqual([
      `关于 ${productSource.displayName}`,
      '项目主页',
      '问题反馈',
      '上游开源文档',
    ])
  })
})
