import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StartupSplash } from '../index'

vi.mock('../StartupSplash.module.scss', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}))

describe('睿眼启动提示', () => {
  it('只展示统一品牌与启动状态', () => {
    render(<StartupSplash theme="dark" />)

    expect(screen.getByRole('status')).toHaveTextContent('睿眼自动化渗透系统正在启动')
    expect(screen.getByText('RuiYan-Pentest')).toBeInTheDocument()
    expect(screen.queryByText(/工作空间|主题|语言设置|诊断日志|引擎版本/)).not.toBeInTheDocument()
    expect(screen.getByRole('status').textContent).not.toMatch(/yak/i)
  })
})
