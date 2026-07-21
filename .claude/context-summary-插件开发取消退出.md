# 项目上下文摘要（插件开发取消退出）

生成时间：2026-07-21 17:12:04 +08:00

## 一、相似实现分析

- `app/renderer/src/main/src/pages/pluginEditor/pluginEditor/PluginEditor.tsx`：集中渲染插件开发头部按钮，并通过 `useSubscribeClose` 注册新建插件页的关闭检查；可复用 `headerExtra` 和既有保存确认设置。
- `app/renderer/src/main/src/pages/pluginEditor/modifyYakitPlugin/ModifyYakitPlugin.tsx`：抽屉右上角关闭与键盘退出均执行未保存检查；确认框支持继续编辑、不保存和保存三种选择。
- `app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.tsx`：标签页关闭统一进入 `onBeforeRemovePage`，再根据路由读取关闭订阅并决定关闭或显示确认框。
- `app/renderer/src/main/src/pages/payloadManager/newPayload.tsx`：同类编辑头部采用叉号图标、取消文案和次级按钮样式，取消按钮位于保存操作左侧。

## 二、项目约定

- 组件与类型使用大驼峰，函数与变量使用小驼峰，钩子以 `use` 开头。
- 源码采用两个空格、单引号、无分号和尾随逗号；测试放在相邻 `__test__` 目录。
- 页面级跨组件动作使用有类型的事件总线，复杂关闭行为由主页面容器统一处理。
- 用户可见文案复用多语言键，本任务使用已有 `YakitButton.cancel`。

## 三、可复用组件

- `PluginEditor.headerExtra`：向头部操作组注入仅由外层页面需要的控件。
- `HubButton`：与现有插件头部一致的响应式按钮。
- `OutlineXIcon`：已有取消和关闭语义图标。
- `useListenWidth`：按页面宽度将文字按钮转换为图标按钮。
- `useSubscribeClose` 与 `onBeforeRemovePage`：现有未保存内容保护链路。
- `modalAfterClose`：以确认框真实销毁为准恢复页面关闭快捷键状态。

## 四、测试策略

- 测试框架为 Vitest、Testing Library 和虚拟文档环境。
- 参考 `components/layout/__test__/RenyanWindowChrome.test.tsx` 的回调点击测试、`components/renyanUI/__test__/RuiYanPrimitives.test.tsx` 的按钮角色查询，以及启动界面相邻测试的模块隔离方式。
- 新增全页与抽屉编辑器相邻测试，先证明当前界面缺少取消入口，再验证关闭请求和订阅所有权。
- 新增确认框生命周期测试，覆盖右上关闭和保存校验未完成两种状态。
- 通过类型检查验证事件发送端与监听端协议一致。

## 五、依赖与集成点

- 内部依赖：插件编辑器头部插槽、页面信息仓库、事件总线、主页面标签容器和关闭订阅仓库。
- 外部依赖：React、ahooks、mitt、Vitest 与 Testing Library，均为仓库现有依赖。
- 配置来源：页面路由使用 `YakitRoute.AddYakitScript`，翻译使用 `yakitUi` 命名空间。

## 六、技术选择

- 采用“页面注入按钮加统一关闭请求”，可以限定展示范围，并保证按钮、标签页叉号与关闭快捷键共享同一状态检查。
- 不直接调用现有 `onCloseFirstMenu`，因为该事件直接移除页面，会绕过未保存确认。
- 不在 `PluginEditor` 内建立新的确认状态，避免复制保存校验与页面移除逻辑。

## 七、风险与充分性检查

- 主要风险是误用直接关闭事件导致内容静默丢失；通过独立的确认关闭事件规避。
- 共享编辑器曾无条件占用单值关闭订阅；改为由全页调用方显式开启，抽屉调用方显式关闭。
- 确认框可见标记曾早于弹窗销毁恢复；改为由 `modalAfterClose` 统一恢复。
- 页面宽度较小时按钮应保持可识别；复用 `HubButton` 的图标模式与提示信息。
- `headerExtra` 当前没有插件编辑器调用方，调整其头部位置不会改变既有页面输出。
- 接口契约、技术选择、主要风险和本地验证方式均已明确，可以进入实施。
- 代码托管搜索因匿名访问频率限制未返回结果；编程文档服务和结构化任务管理服务未提供。本任务不改变第三方库用法，采用仓库源码、代码索引、内置计划和本地验证完成等价工作。
