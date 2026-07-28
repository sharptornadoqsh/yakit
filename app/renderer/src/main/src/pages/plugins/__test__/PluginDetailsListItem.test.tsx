import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PluginDetailsListItem } from '../baseTemplate'

vi.hoisted(() => {
  const asyncMethod = vi.fn().mockResolvedValue(undefined)
  const channel = new Proxy(asyncMethod, {
    get: (_target, key) => (key === 'then' ? undefined : asyncMethod),
  })
  Object.defineProperty(window, 'require', {
    configurable: true,
    value: () => ({ ipcRenderer: channel }),
  })
  Object.defineProperty(window, 'yakitBridge', {
    configurable: true,
    value: new Proxy({}, { get: () => channel }),
  })
})

vi.mock('@/utils/clipboard', () => ({
  getClipboardText: vi.fn().mockResolvedValue(''),
  setClipboardText: vi.fn(),
}))

vi.mock('@/utils/kv', () => ({
  getRemoteValue: vi.fn().mockResolvedValue(''),
  setRemoteValue: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../funcTemplate', () => ({
  AuthorIcon: () => null,
  AuthorImg: ({ src }: { src: string }) => <img src={src} alt="插件头像" />,
  FuncSearch: () => null,
  PluginDiffEditorModal: () => null,
  PluginEditorModal: () => null,
  TagsListShow: () => null,
}))

vi.mock('@/assets/icon/outline', () => ({
  OutlineArrowscollapseIcon: () => null,
  OutlineArrowsexpandIcon: () => null,
  OutlineIdentificationIcon: () => null,
  OutlineQuestionmarkcircleIcon: () => <svg data-testid="plugin-help-icon" />,
  OutlineReplyIcon: () => null,
  OutlineSparklesIcon: () => null,
  OutlineTagIcon: () => null,
  OutlineTerminalIcon: () => <svg data-testid="plugin-source-icon" />,
}))

vi.mock('@/utils/editors', () => ({
  YakEditor: () => <div data-testid="source-editor" />,
}))

vi.mock('@/components/yakitUI/YakitEditor/YakitEditor', () => ({
  YakitEditor: () => null,
}))

vi.mock('@/components/yakitUI/YakitDiffEditor/YakitDiffEditor', () => ({
  YakitDiffEditor: () => null,
}))

interface TestPlugin {
  id: string
  name: string
  content: string
}

const plugin: TestPlugin = {
  id: 'plugin-1',
  name: '专项检测插件',
  content: 'plugin source',
}

const createProps = () => ({
  order: 3,
  plugin,
  selectUUId: '',
  check: false,
  headImg: 'avatar.png',
  pluginUUId: plugin.id,
  pluginName: plugin.name,
  help: '插件说明',
  content: plugin.content,
  official: true,
  pluginType: 'yak',
  isCorePlugin: false,
  optCheck: vi.fn(),
  onPluginClick: vi.fn(),
})

describe('PluginDetailsListItem', () => {
  it('纯名称模式只显示名称和复选框，并保留完整插件回调', () => {
    const props = createProps()
    render(<PluginDetailsListItem<TestPlugin> {...props} displayMode="name-only" />)

    expect(screen.getByTitle(plugin.name)).toHaveTextContent(plugin.name)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '插件头像' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('plugin-help-icon')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plugin-source-icon')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle(plugin.name))
    expect(props.onPluginClick).toHaveBeenCalledWith(plugin, 3)

    fireEvent.click(screen.getByRole('checkbox'))
    expect(props.optCheck).toHaveBeenCalledWith(plugin, true)
  })

  it('默认模式继续显示头像和右侧操作区', () => {
    const props = createProps()
    render(<PluginDetailsListItem<TestPlugin> {...props} enableCheck={false} />)

    expect(screen.getByRole('img', { name: '插件头像' })).toBeInTheDocument()
    expect(screen.getByTestId('plugin-help-icon')).toBeInTheDocument()
    expect(screen.getByTestId('plugin-source-icon')).toBeInTheDocument()
  })
})
