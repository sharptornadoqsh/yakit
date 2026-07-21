import React, { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YakitRoute } from '@/enums/yakitRoute'
import { AddYakitPlugin } from '../AddYakitPlugin'

const { emit } = vi.hoisted(() => ({
  emit: vi.fn(),
}))

vi.mock('../AddYakitPlugin.module.scss', () => ({
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
    PluginEditor: react.forwardRef(
      (
        { headerExtra, enablePageCloseSubscribe }: { headerExtra?: ReactNode; enablePageCloseSubscribe?: boolean },
        ref,
      ) => {
        react.useImperativeHandle(ref, () => ({
          setNewPlugin: vi.fn(),
          onBtnLocalSave: vi.fn(),
        }))
        return (
          <div data-testid="plugin-editor" data-page-close-subscribe={String(enablePageCloseSubscribe)}>
            {headerExtra}
          </div>
        )
      },
    ),
  }
})

vi.mock('@/store/pageInfo', () => ({
  usePageInfo: (selector: (state: { queryPagesDataById: () => undefined }) => unknown) =>
    selector({ queryPagesDataById: () => undefined }),
}))

vi.mock('@/defaultConstants/AddYakitScript', () => ({
  defaultAddYakitScriptPageInfo: {},
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

vi.mock('@/pages/pluginHub/hooks/useListenWidth', () => ({
  default: () => 1200,
}))

vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    t: (key: string) => (key === 'YakitButton.cancel' ? '取消' : key),
  }),
}))

vi.mock('@/assets/icon/outline', () => ({
  OutlineXIcon: () => <svg aria-hidden="true" />,
}))

vi.mock('@/pages/pluginHub/hubExtraOperate/funcTemplate', () => ({
  HubButton: ({ name, onClick }: { name: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {name}
    </button>
  ),
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: { emit },
}))

describe('AddYakitPlugin', () => {
  beforeEach(() => {
    emit.mockClear()
  })

  it('点击取消时请求经过未保存检查关闭插件开发页', () => {
    render(<AddYakitPlugin />)

    expect(screen.getByTestId('plugin-editor')).toHaveAttribute('data-page-close-subscribe', 'true')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(emit).toHaveBeenCalledWith('requestCloseFirstMenu', {
      menuName: '',
      route: YakitRoute.AddYakitScript,
    })
  })
})
