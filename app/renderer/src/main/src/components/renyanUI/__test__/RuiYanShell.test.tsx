import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuiYanAppShell } from '../RuiYanShell'

vi.mock('../RuiYanUI.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

vi.mock('@/assets/renyan-icon.svg', () => ({ default: 'renyan-icon.svg' }))

describe('睿眼应用外壳', () => {
  afterEach(() => {
    document.body.classList.remove('ruiyan-workspace-active')
  })

  it('仅在登录后外壳挂载期间启用公共浮层主题', () => {
    const { unmount } = render(
      <RuiYanAppShell navigation={<nav>主导航</nav>}>
        <div>工作区</div>
      </RuiYanAppShell>,
    )

    expect(document.body).toHaveClass('ruiyan-workspace-active')

    unmount()

    expect(document.body).not.toHaveClass('ruiyan-workspace-active')
  })
})
