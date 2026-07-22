import { fireEvent, render, screen } from '@testing-library/react'
import { Select } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import {
  RuiYanBreadcrumb,
  RuiYanButton,
  RuiYanConfirmDialog,
  RuiYanDataTable,
  RuiYanDrawer,
  RuiYanModal,
  RuiYanPermissionMatrix,
  RuiYanSegmented,
  RuiYanTabs,
  showRuiYanModal,
} from '../RuiYanPrimitives'

vi.mock('../RuiYanUI.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}))

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

  it('不可关闭的模态框隐藏关闭按钮并忽略退出键', () => {
    const onClose = vi.fn()
    render(
      <RuiYanModal open closable={false} title="强制设置" onClose={onClose}>
        <div>必须完成当前设置</div>
      </RuiYanModal>,
    )

    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('危险确认操作位于浮层底部左侧并使用统一小尺寸', () => {
    const onConfirm = vi.fn()
    render(
      <RuiYanConfirmDialog
        open
        title="删除任务"
        message="删除后无法恢复"
        danger
        confirmText="删除"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: '删除任务' })).toHaveStyle({ width: '480px' })
  })

  it('面包屑标记当前位置并保留层级顺序', () => {
    render(
      <RuiYanBreadcrumb
        items={[
          { key: 'team', label: '团队协作' },
          { key: 'role', label: '角色权限' },
        ]}
      />,
    )

    expect(screen.getByRole('navigation', { name: '当前位置' })).toHaveTextContent('团队协作角色权限')
    expect(screen.getByText('角色权限')).toHaveAttribute('aria-current', 'page')
  })

  it('分段控制只触发真实可用选项', () => {
    const onChange = vi.fn()
    render(
      <RuiYanSegmented
        items={[
          { value: 'request', label: '请求' },
          { value: 'response', label: '响应' },
          { value: 'planned', label: '规划项', disabled: true },
        ]}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: '响应' }))
    expect(onChange).toHaveBeenCalledWith('response')
    expect(screen.getByRole('radio', { name: '响应' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '规划项' })).toBeDisabled()
  })

  it('权限矩阵区分真实布尔值和不适用状态', () => {
    render(
      <RuiYanPermissionMatrix
        columns={[
          { key: 'read', label: '查看' },
          { key: 'manage', label: '管理' },
        ]}
        rows={[
          {
            key: 'traffic',
            label: '流量管理',
            values: { read: true, manage: null },
          },
        ]}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '流量管理 查看' })).toBeChecked()
    expect(screen.getByLabelText('不适用')).toHaveTextContent('—')
  })

  it('抽屉支持说明和分区导航', () => {
    render(
      <RuiYanDrawer
        open
        title="高级配置"
        description="配置真实代理参数"
        navigation={<button type="button">代理设置</button>}
        onClose={vi.fn()}
      >
        <div>监听地址</div>
      </RuiYanDrawer>,
    )

    expect(screen.getByRole('dialog', { name: '高级配置' })).toHaveTextContent('配置真实代理参数')
    expect(screen.getByRole('button', { name: '代理设置' })).toBeInTheDocument()
  })

  it('抽屉内的下拉选项挂载到当前对话框', async () => {
    render(
      <RuiYanDrawer open title="额外参数" onClose={vi.fn()}>
        <Select aria-label="爆破用户字典">
          <Select.Option value="user_top10">user_top10</Select.Option>
        </Select>
      </RuiYanDrawer>,
    )

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '爆破用户字典' }))

    const dialog = screen.getByRole('dialog', { name: '额外参数' })
    const option = await screen.findByRole('option', { name: 'user_top10' })
    expect(dialog).toContainElement(option)
  })

  it('命令式弹窗返回可销毁句柄并沿用统一对话框结构', async () => {
    const handle = showRuiYanModal({
      title: '账号信息',
      description: '仅显示真实接口返回的数据',
      content: <div>测试用户</div>,
    })

    expect(await screen.findByRole('dialog', { name: '账号信息' })).toHaveTextContent('测试用户')
    handle.destroy()
    expect(screen.queryByRole('dialog', { name: '账号信息' })).not.toBeInTheDocument()
  })
})
