import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginRequiredState } from '../LoginRequiredState'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
}))

vi.mock('@/utils/eventBus/eventBus', () => ({
  default: {
    emit: mocks.emit,
  },
}))

vi.mock('../RenyanState', () => {
  const React = require('react')

  return {
    RenyanState: ({
      title,
      description,
      actionLabel,
      onAction,
    }: {
      title: React.ReactNode
      description: React.ReactNode
      actionLabel: string
      onAction: () => void
    }) =>
      React.createElement(
        'section',
        null,
        React.createElement('strong', null, title),
        React.createElement('span', null, description),
        React.createElement('button', { type: 'button', onClick: onAction }, actionLabel),
      ),
  }
})

vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    t: (key: string) =>
      ({
        'Layout.RenyanState.loginRequiredTitle': '需要登录',
        'Layout.RenyanState.loginRequiredDescription': '当前未登录或登录状态已失效，请重新登录后继续访问。',
        'Layout.RenyanState.loginRequiredAction': '重新登录',
      })[key] ?? key,
  }),
}))

describe('登录需要状态', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('展示会话失效说明与重新登录操作', () => {
    render(<LoginRequiredState />)

    expect(screen.getByText('需要登录')).toBeInTheDocument()
    expect(screen.getByText('当前未登录或登录状态已失效，请重新登录后继续访问。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新登录' })).toBeInTheDocument()
  })

  it('通过现有主界面事件开启登录弹窗', () => {
    render(<LoginRequiredState />)

    fireEvent.click(screen.getByRole('button', { name: '重新登录' }))

    expect(mocks.emit).toHaveBeenCalledWith('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openLogin)
  })
})
