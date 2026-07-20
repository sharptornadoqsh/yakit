## 项目上下文摘要（登录过期重新登录）

生成时间：2026-07-20 16:28:03 +08:00

### 1. 需求与验收条件

- 目标：用户会话失效后，用户管理与角色权限页面提供可操作的重新登录入口。
- 范围：渲染端登录状态展示、既有登录弹窗事件、多语言文本与定向测试。
- 验收条件：未登录时显示重新登录按钮；点击按钮触发现有登录弹窗事件；已登录但非管理员时仍显示普通无权限状态；既有四百零一响应处理保持原状。

### 2. 相似实现分析

- `app/renderer/src/main/src/components/yakitUI/RenyanState/RenyanState.tsx`：统一状态组件已提供操作文本与操作回调，并使用项目按钮组件展示操作。
- `app/renderer/src/main/src/routes/newRoute.tsx`：错误边界通过统一状态组件传入操作文本与回调，证明状态组件的操作协议可直接复用。
- `app/renderer/src/main/src/components/layout/UILayout.tsx` 与 `app/renderer/src/main/src/pages/MainOperator.tsx`：顶部登录入口发送统一设置菜单事件，主页面监听事件并显示既有登录弹窗。
- `app/renderer/src/main/src/pages/ruleManagement/template.tsx`：未登录状态提供登录按钮，并打开既有登录组件，说明无权限与未登录应呈现不同操作。

### 3. 现有鉴权链路

- `app/main/httpServer.js` 将服务端四百零一响应转换为统一响应，并通过 `expireUserInfo` 清除主进程用户状态。
- `app/renderer/src/main/src/services/fetch.ts` 的 `handleAxios` 调用 `tokenOverdue`，后者执行本地退出、远程控制退出与失效通知。
- `app/main/handlers/userInfo.js` 在退出后发送 `login-out`；`MainOperatorContent` 将渲染端用户状态恢复为未登录。
- `AccountAdminPage` 与 `RoleAdminPage` 当前把未登录和非管理员合并为同一种无权限状态，因此页面没有登录操作。

### 4. 项目约定与复用组件

- 命名采用大驼峰组件、小驼峰函数；代码使用两个空格、单引号、无分号与尾随逗号。
- 复用 `RenyanState`、`useI18nNamespaces`、全局事件总线与 `RENYAN_SHELL_EVENTS.openLogin`，不建立新的登录弹窗或鉴权状态。
- 多语言资源位于简体中文、繁体中文与英文 `layout.json`，新增文本归入 `Layout.RenyanState`。
- 测试采用 Vitest、测试库与模块模拟；参考 `RenyanTaskCenter.test.tsx` 的事件发送断言。

### 5. 依赖、集成点与风险

- 输入为全局用户状态中的 `isLogin` 与 `role`；输出为登录需要状态或普通无权限状态。
- 登录操作发送 `onUIOpSettingMenuSelect` 事件，现有 `MainOperator` 监听器负责显示弹窗。
- 主要风险是把权限不足误判为会话失效；通过两个独立条件分支隔离。
- 当前工作区已有布局、主进程与审查文档差异；本任务不覆盖这些既有内容。
- 当前工具列表没有顺序思考、任务管理、桌面文件管理、编程文档与代码托管搜索工具；采用结构化计划、代码图、定向文本检索与现有测试承担对应调查。本任务没有新增第三方库，因此无需外部接口文档。

### 6. 充分性检查

- 接口契约：是。需要登录组件无业务参数，点击后发送既有登录事件。
- 技术选型：是。复用统一状态与既有弹窗事件，修改范围有限。
- 风险识别：是。重点验证未登录与非管理员分支不会混合。
- 验证方式：是。执行组件定向测试、相关状态配置测试、类型检查、代码规范检查与差异检查。
