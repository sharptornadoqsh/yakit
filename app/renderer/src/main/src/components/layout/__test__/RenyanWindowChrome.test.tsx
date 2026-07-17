import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RenyanWindowChrome } from '../RenyanWindowChrome'

vi.mock('../uiLayout.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

vi.mock('../MacUIOp', () => ({
  MacUIOp: () => <div data-testid="mac-window-controls" />,
}))

vi.mock('../WinUIOp', () => ({
  WinUIOp: () => <div data-testid="win-window-controls" />,
}))

const defaultProps = {
  currentProjectId: '1',
  pageChildrenShow: true,
  draggable: true,
  onToggleWindowSize: vi.fn(),
}

describe('睿眼极简窗口框', () => {
  it('微软系统仅保留微软系统窗口控制', () => {
    render(<RenyanWindowChrome {...defaultProps} system="Windows_NT" />)

    expect(screen.getByTestId('win-window-controls')).toBeInTheDocument()
    expect(screen.queryByTestId('mac-window-controls')).not.toBeInTheDocument()
  })

  it('苹果系统仅保留苹果系统窗口控制', () => {
    render(<RenyanWindowChrome {...defaultProps} system="Darwin" />)

    expect(screen.getByTestId('mac-window-controls')).toBeInTheDocument()
    expect(screen.queryByTestId('win-window-controls')).not.toBeInTheDocument()
  })

  it('拖动区域响应双击窗口操作', () => {
    const onToggleWindowSize = vi.fn()
    render(<RenyanWindowChrome {...defaultProps} onToggleWindowSize={onToggleWindowSize} />)

    fireEvent.doubleClick(screen.getByTestId('renyan-window-drag-region'))
    expect(onToggleWindowSize).toHaveBeenCalledTimes(1)
  })
})
