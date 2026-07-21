import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { YakScript } from '@/pages/invoker/schema'
import { ModifyYakitPlugin } from '../ModifyYakitPlugin'

vi.mock('../ModifyYakitPlugin.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

vi.mock('ahooks', async () => {
  const actual = await vi.importActual<typeof import('ahooks')>('ahooks')
  return {
    ...actual,
    useInViewport: () => [true],
  }
})

vi.mock('../../pluginEditor/PluginEditor', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    PluginEditor: react.forwardRef(({ enablePageCloseSubscribe }: { enablePageCloseSubscribe?: boolean }, ref) => {
      react.useImperativeHandle(ref, () => ({
        setEditPlugin: vi.fn(),
        onCheckUnSaved: vi.fn(),
        onSaveAndExit: vi.fn(),
        onBtnLocalSave: vi.fn(),
      }))
      return <div data-testid="plugin-editor" data-page-close-subscribe={String(enablePageCloseSubscribe)} />
    }),
  }
})

vi.mock('@/components/renyanUI', async () => {
  const react = await vi.importActual<typeof import('react')>('react')
  return {
    RuiYanDrawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    RuiYanModal: () => null,
    RuiYanButton: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  }
})

vi.mock('@ant-design/icons', () => ({
  ExclamationCircleOutlined: () => null,
}))

vi.mock('@/utils/globalShortcutKey/utils', () => ({
  registerShortcutKeyHandle: vi.fn(),
}))

vi.mock('@/utils/globalShortcutKey/events/pageMaps', () => ({
  ShortcutKeyPage: { YakitMultiple: 'YakitMultiple' },
}))

vi.mock('@/utils/globalShortcutKey/events/useShortcutKeyTrigger', () => ({
  default: vi.fn(),
}))

vi.mock('@/utils/globalShortcutKey/events/multiple/yakitMultiple', () => ({
  getStorageYakitMultipleShortcutKeyEvents: vi.fn(),
}))

describe('ModifyYakitPlugin', () => {
  it('抽屉编辑器不占用全页插件开发关闭订阅', () => {
    const plugin = {
      Id: 1,
      ScriptName: 'test-plugin',
      UUID: 'test-uuid',
    } as YakScript

    render(<ModifyYakitPlugin plugin={plugin} visible={true} onCallback={vi.fn()} />)

    expect(screen.getByTestId('plugin-editor')).toHaveAttribute('data-page-close-subscribe', 'false')
  })
})
