# 项目上下文摘要（睿眼阶段九开发模式轻量验收）

生成时间：2026-07-15 00:50:07 +08:00

## 一、任务范围与验收条件

本阶段只查看开发工作树中的产品品牌、页面布局、菜单结构、主要安全功能入口、外部账号服务页面与基本可用性。只允许处理开发模式下直接可见的严重菜单、路由、标题、布局、样式或状态问题。外部服务协议、引擎协议、数据库、许可证、后端模块、软件打包、跨平台验证和全量测试均不在范围内。

验收条件如下：

- 当前分支为 `qsh`，工作区在开始时无改动，`origin` 指向指定仓库。
- 工作台、七组一级菜单、目标二级入口和主要页面可以显示，不出现白屏或致命界面错误。
- 当前服务、用户管理与角色权限页面只读取既有外部服务数据，不提交创建、编辑、删除或密码操作。
- 需求矩阵的三十一项状态只使用目标文件限定的九种状态，并严格区分动态查看、静态证据、外部服务和第三方材料。
- 只执行定向回归、差异空白检查、分支检查与工作区检查，不执行构建、打包、全量测试或跨平台验证。

## 二、相似实现分析

- `app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx`
  - 模式：顶部导航在本地保存 `activeGroupKey`，并通过 `selectNavigationGroup` 事件与侧边栏同步用户主动选择。
  - 可复用：`buildRenyanMenu`、`findRenyanMenuPath`、现有事件常量和菜单项激活函数。
  - 事项：当前顶部导航没有订阅活动标签页路由，工作台快捷入口改变路由后仍保留原一级组高亮。
- `app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx` 中的 `RenyanWorkspaceSidebar`
  - 模式：根据 `currentRoute` 调用 `findRenyanMenuPath`，并在路径变化时更新一级组。
  - 可复用：活动路径计算和仅在路径存在时更新组键的效果。
  - 事项：顶部导航应沿用同一规则，避免顶部与侧边栏产生两套映射逻辑。
- `app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.tsx`
  - 模式：每次标签页变化都把 `currentTabKey` 写入 `usePageInfo` 的 `currentPageTabRouteKey`。
  - 可复用：`usePageInfo` 作为活动路由的单一状态来源。
  - 事项：顶部导航读取该值即可覆盖菜单入口、工作台快捷入口和内部跳转，无需修改业务页面。
- `app/renderer/src/main/src/components/layout/UILayout.tsx`
  - 模式：使用 `usePageInfo` 与 `zustand/shallow` 读取活动路由，并将其用于窗口标题等全局显示。
  - 可复用：同一选择器与浅比较写法。
  - 事项：该模式已经用于全局外壳，适合顶部导航的显示同步。

## 三、项目约定

- 组件与类型使用大驼峰，函数与变量使用小驼峰，测试位于相邻 `__test__` 目录。
- TypeScript 采用两空格、单引号、无分号和尾逗号。
- 显示层只依赖既有菜单模型、活动路由状态和事件总线，不修改路由值或页面协议。
- 文档使用简体中文，稳定需求编号与需求原文保持不变。
- 所有修改、提交和推送只进入 `qsh` 与 `origin/qsh`。

## 四、可复用组件与接口

- `findRenyanMenuPath`：从活动路由定位一级菜单路径。
- `buildRenyanMenu`：生成当前功能标志和能力范围内的菜单树。
- `usePageInfo`：提供当前活动标签页路由。
- `RenyanWorkspaceSidebar`：现有路由到一级组同步模式。
- `@testing-library/react` 与 Vitest：组件渲染、点击和状态变化断言。

## 五、测试策略

- 新增顶部导航定向组件测试，模拟活动路由从工作台变为历史流量，断言一级组高亮随之变化。
- 保留一个用户主动选择一级组的断言，确认路由未变化时现有交互不受影响。
- 执行新增测试与既有菜单模型测试，不执行全量 Vitest。
- 使用 `git diff --check`、`git branch --show-current` 和 `git status --short` 完成最低检查。
- 修改后再次以当前开发工作树界面复现工作台快捷入口切换，确认顶部与侧边栏一致。

## 六、依赖与集成点

- 外部依赖：React、Zustand、Vitest、Testing Library。
- 内部依赖：菜单模型、页面状态仓库、顶部导航和侧边栏。
- 输入：`currentPageTabRouteKey`。
- 输出：顶部一级导航的活动组样式及对应二级菜单。
- 集成路径：业务页面更新活动标签页路由，页面状态仓库通知顶部导航，顶部导航用菜单路径更新活动组。

## 七、技术选择与风险

- 采用活动路由驱动顶部导航，直接复用侧边栏的路径算法，不增加新的事件或路由映射。
- 用户主动选择一级组时，活动路由没有变化，因此现有浏览菜单行为保持不变；实际打开页面后，活动路由成为最终显示依据。
- 菜单模型中不存在的内部路由不会改变当前活动组，避免无关页面强制跳回工作台。
- 当前只有管理员外部账号，不能动态证明低权限拒绝、令牌过期和服务端密码存储；文档必须保持未完整验证。
- 启动页与私有域登录页本次未为查看而清除现有会话，采用阶段八既有动态证据并明确本阶段未重新查看。

## 八、工具与资料说明

CodeGraph 索引有效且为最新状态。当前工具集没有 `sequential-thinking`、`shrimp-task-manager`、`desktop-commander`、Context7 或 GitHub 代码搜索接口；采用结构化计划、CodeGraph、`rg`、PowerShell、Excel 只读接口、桌面应用控制和 `apply_patch` 承担对应工作。功能要求表为传统二进制工作簿，通过电子表格程序只读接口提取，三十一项编号需求与现有追踪表一致。
