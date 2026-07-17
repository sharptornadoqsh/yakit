import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RuiYanButton, RuiYanDataTable, RuiYanModal, RuiYanTabs } from '../RuiYanPrimitives'

describe('睿眼公共组件', () => {
  it('读取状态会禁用按钮并公开忙碌状态', () => {
    render(<RuiYanButton loading>保存</RuiYanButton>)

    const button = screen.getByRole('button', { name: '保存' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('页签支持方向键切换并关联内容面板', () => {
    render(
      <RuiYanTabs
        items={[
          { key: 'request', label: '请求', content: <div>请求内容</div> },
          { key: 'response', label: '响应', content: <div>响应内容</div> },
        ]}
      />,
    )

    const requestTab = screen.getByRole('tab', { name: '请求' })
    requestTab.focus()
    fireEvent.keyDown(requestTab, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: '响应' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('响应内容')
  })

  it('受控键指向禁用项时选择首个可用页签', () => {
    render(
      <RuiYanTabs
        activeKey="disabled"
        items={[
          { key: 'available', label: '可用页签', content: <div>可用内容</div> },
          { key: 'disabled', label: '禁用页签', content: <div>禁用内容</div>, disabled: true },
        ]}
      />,
    )

    expect(screen.getByRole('tab', { name: '可用页签' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('可用内容')
  })

  it('数据表没有真实记录时显示空状态', () => {
    render(
      <RuiYanDataTable<{ id: number; name: string }>
        columns={[{ key: 'name', title: '名称', render: (record) => record.name }]}
        data={[]}
        rowKey="id"
        emptyTitle="暂无任务"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('暂无任务')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('模态框声明对话框语义并响应退出键', () => {
    const onClose = vi.fn()
    render(
      <RuiYanModal open title="任务设置" onClose={onClose}>
        <button type="button">确认</button>
      </RuiYanModal>,
    )

    expect(screen.getByRole('dialog', { name: '任务设置' })).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
