## 项目上下文摘要（会话、数据库与爆破字典）

生成时间：2026-07-22 17:45:00 +08:00

### 一、需求与验收边界

- 修复项目工作区关闭后业务页面使用已关闭数据库的问题，报告查询与流量查询不得在未选定项目时重新挂载。
- 复用现有在线令牌刷新接口，在有效登录期间定期刷新，并确保主进程会话能够同步到渲染端状态。
- 同一登录会话发生并发四百零一响应时，只执行一次退出处理和一次过期提示。
- 用户完成一次登录后，用户管理与角色管理直接读取同一份全局用户状态，不再要求页面内再次登录。
- 弱口令额外参数抽屉中的用户字典与密码字典必须展示字典管理中的本地字典，并能读取所选字典内容。

### 二、现有实现分析

- `app/renderer/src/main/src/components/layout/UILayout.tsx`：进入项目管理时调用 `setCurrentProject` 且不传项目编号，业务页面在项目管理展示期间会卸载；新界面的项目弹窗仍允许点击关闭，关闭回调会立即重新展示业务页面，此时数据库仍处于关闭状态。
- `app/renderer/src/main/src/pages/MainOperator.tsx`：登录事件只依赖 `fetch-signin-token` 推送；令牌刷新监听的空依赖数组捕获初始用户信息，登录后仍可能使用未登录状态，因此刷新调用被跳过。
- `app/main/handlers/userInfo.js`：主进程持续保存 `USER_INFO`，并已提供 `get-login-user-info` 查询接口；企业登录会同步更新该状态并发送 `fetch-signin-token`。
- `app/renderer/src/main/src/utils/login.tsx`：已有 `refreshToken`，通过 `refresh/token/online` 延长当前会话，无需新增网络协议。
- `app/renderer/src/main/src/services/fetch.ts`：企业版每个四百零一响应都会分别退出、清理全局令牌并显示通知，多个并发请求会产生重复提示。
- `app/renderer/src/main/src/pages/loginOperationMenu/AccountAdminPage.tsx` 与 `RoleAdminPage.tsx`：两个页面都直接读取 Zustand 的 `userInfo`，因此主进程会话未及时同步时会显示 `LoginRequiredState`。
- `app/renderer/src/main/src/pages/securityTool/newBrute/BruteExecuteParamsDrawer.tsx`：抽屉会调用 `GetAllPayloadGroup` 并渲染 `DataBase` 与 `Folder` 类型字典，数据查询协议与字典管理一致。
- `app/renderer/src/main/src/components/renyanUI/RuiYanUI.module.scss`：公共浮层层级为一千一百；当前 Ant Design 下拉层级为一千零五十，挂在文档主体的字典下拉会被抽屉覆盖。

### 三、相似实现与复用点

- `app/renderer/src/main/src/pages/EnterpriseJudgeLogin.tsx` 已使用 `get-login-user-info` 判断主进程中的现有会话，可复用相同查询协议。
- `app/renderer/src/main/src/NewApp.tsx` 在同步用户信息后调用 `refreshToken`，证明当前刷新接口是既定会话保持机制。
- `app/renderer/src/main/src/utils/SelectItem/index.tsx` 使用 `GetAllPayloadGroup` 与 `Codec` 完成字典选择和内容展开，可复用该数据约定。
- `app/renderer/src/main/src/pages/fuzzer/HTTPFuzzerPage.tsx` 使用 `GetAllPayloadGroup` 的 `Nodes` 结构展示字典，证明弱口令页面的返回字段没有偏差。
- `app/renderer/src/main/src/pages/payloadManager/newPayload.tsx` 使用 `DataBase`、`Folder` 与节点名称组织字典，证明截图中的三个字典属于可选数据。

### 四、依赖与集成点

```text
企业登录
  -> 主进程 USER_INFO
  -> get-login-user-info / fetch-signin-token
  -> Zustand userInfo
  -> 用户管理、角色管理、顶部用户信息
  -> refresh/token/online 定期刷新

项目工作区
  -> setCurrentProject（关闭当前项目数据库）
  -> 项目管理弹窗
  -> 选择项目并由 ProjectManage 调用 onFinish
  -> getCurrentProjectEx
  -> 业务页面重新挂载

字典管理
  -> GetAllPayloadGroup.Nodes
  -> 弱口令 SelectPayload
  -> Ant Design 下拉弹出层
  -> Codec 展开字典内容
```

### 五、测试策略

- 测试框架为 Vitest、jsdom 与 Testing Library，测试文件位于相邻 `__test__` 目录。
- 在公共浮层测试中加入真实 Ant Design 下拉，断言选项弹出节点属于当前对话框，防止层级隔离再次失效。
- 为会话生命周期增加组件测试，覆盖主进程状态查询、登录事件同步、即时刷新、定时刷新、事件刷新及精确清理监听器。
- 扩展令牌过期测试，覆盖同一令牌的并发四百零一响应只触发一次退出与通知。
- 项目工作区使用既有不可关闭浮层行为测试作为组件能力证据，并通过类型检查与目标差异确认项目弹窗启用该属性。
- 弱口令数据查询与参数转换保留现有协议，定向测试覆盖公共浮层和字典选项的显式值。

### 六、实现约定

- React 组件与类型使用大驼峰，函数与变量使用小驼峰，钩子以 `use` 开头。
- 保持两个空格、单引号、无分号、尾随逗号及一百二十字符宽度。
- 仅复用现有 Electron 通道、Zustand 状态、在线刷新接口与公共浮层，不增加新的认证协议或字典存储。
- 事件清理使用原监听函数，避免删除同一通道上的其他监听器。

### 七、关键风险

- 刷新间隔必须明显短于服务端有效期；当前仓库没有暴露有效期配置，因此采用十分钟周期，并保留窗口状态变化触发的即时刷新。
- 四百零一去重必须按令牌区分；新登录令牌可再次触发真实过期处理，同一令牌的并发响应只处理一次。
- 下拉弹出节点进入公共浮层后必须避免被滚动内容裁剪，因此容器选择公共浮层根节点，不选择滚动正文节点。
- 项目管理期间数据库刻意关闭；只有项目选择完成后才能恢复业务页面，关闭按钮必须禁用。

### 八、上下文充分性检查

- 已定义接口契约：主进程用户查询返回 `UserInfoProps`，字典查询返回 `Nodes`，令牌刷新沿用既有接口。
- 已理解技术选择：复用现有协议并将生命周期集中到单一钩子，公共浮层负责其内部弹出节点。
- 已识别主要风险：并发四百零一、陈旧闭包、事件误清理、数据库未选择、弹出层层级与滚动裁剪。
- 已确定验证方式：定向回归测试、完整类型检查、代码规范检查、国际化检查、差异检查与代码索引同步。

### 九、工具与资料说明

- 本地代码图索引状态有效，已用于确认跨模块调用关系；精确内容检索与文件阅读使用桌面文件工具。
- 当前工具集中没有结构化任务管理服务与 Context7；本任务没有改变第三方接口用法，依赖仓库已安装的 Ant Design 样式变量与现有实现作为直接证据。
- 代码托管公开搜索没有获得可用实现，最终方案以当前仓库执行路径为依据。
