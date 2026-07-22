import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import emiter from '@/utils/eventBus/eventBus'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'
import { useLoginPrompt } from '../useLoginPrompt'

const LoginPromptHarness: React.FC<{ isLogin: boolean }> = ({ isLogin }) => {
  const { loginShow, openLogin, closeLogin } = useLoginPrompt(isLogin)

  return (
    <>
      <button type="button" onClick={openLogin}>
        打开登录
      </button>
      {loginShow ? (
        <div role="dialog" aria-label="登录窗口">
          <button type="button" onClick={closeLogin}>
            关闭登录
          </button>
        </div>
      ) : null}
    </>
  )
}

describe('login prompt lifecycle', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens directly while signed out and closes when the session becomes signed in', () => {
    const view = render(<LoginPromptHarness isLogin={false} />)

    fireEvent.click(screen.getByRole('button', { name: '打开登录' }))
    expect(screen.getByRole('dialog', { name: '登录窗口' })).toBeInTheDocument()

    view.rerender(<LoginPromptHarness isLogin={true} />)
    expect(screen.queryByRole('dialog', { name: '登录窗口' })).not.toBeInTheDocument()
  })

  it('opens from the existing global menu event while signed out', () => {
    render(<LoginPromptHarness isLogin={false} />)

    act(() => {
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openLogin)
    })

    expect(screen.getByRole('dialog', { name: '登录窗口' })).toBeInTheDocument()
  })

  it('does not reopen while the current application session remains signed in', () => {
    render(<LoginPromptHarness isLogin={true} />)

    fireEvent.click(screen.getByRole('button', { name: '打开登录' }))
    act(() => {
      emiter.emit('onUIOpSettingMenuSelect', RENYAN_SHELL_EVENTS.openLogin)
    })

    expect(screen.queryByRole('dialog', { name: '登录窗口' })).not.toBeInTheDocument()
  })
})
