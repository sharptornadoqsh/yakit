# 项目上下文摘要（团队协作测试正文）

生成时间：2026-07-23 20:51:26 +08:00

## 一、相似实现分析

- `app/renderer/src/main/src/pages/teamCollaboration/TeamCollaborationPage.tsx`
  - 使用团队、项目、权限和请求状态驱动页面。
  - 复用现有共享数据与结果接口，不建立独立数据协议。
  - 异步详情读取需要防止较早请求覆盖较晚选择。
- `app/renderer/src/main/src/services/teamCollaboration.ts`
  - 提供测试数据、测试结果、同步与项目接口的类型定义和统一请求封装。
  - 写入字段使用字符串正文与对象元数据，读取字段保持服务端响应类型。
- `app/renderer/src/main/src/pages/teamCollaboration/__test__/TeamCollaborationPage.test.tsx`
  - 使用 Vitest、JSDOM 与服务模拟验证页面交互。
  - 断言正文、元数据、关联编号、权限、空值、失败状态和异步乱序。
- `app/renderer/src/main/src/pages/teamCollaboration/teamProjectBundle.ts`
  - 项目归档与共享记录均通过既有协作服务交互。
  - 项目下载和本机恢复属于另一职责，不应混入测试正文编辑逻辑。

## 二、项目约定

- React 组件采用大驼峰命名，函数与状态采用小驼峰命名。
- 源码使用两个空格、单引号、无分号和尾随逗号。
- 测试位于相邻 `__test__` 目录，使用 Vitest 与 Testing Library。
- 页面继续使用现有睿眼组件、通知函数和权限判断，不新增平行状态体系。

## 三、可复用组件

- `teamCollaboration.ts`：共享数据、共享结果和详情读取接口。
- `TeamCollaborationPage.tsx` 既有项目选择、权限、列表刷新与同步状态。
- `RuiYanInput`、`RuiYanTextArea`、`RuiYanButton`、`RuiYanEmpty`：统一交互组件。
- 既有请求序号模式：保护异步详情选择不受较早响应覆盖。

## 四、测试策略

- 正常流程：提交实际正文、元数据、状态、严重级别和可选数据关联。
- 边界条件：空正文、空元数据、无关联结果、同名项目和只读权限。
- 错误恢复：列表或详情请求失败时显示错误，随后选择仍能更新详情。
- 并发条件：团队、项目、同步、快照、详情和创建请求较晚返回时，只能改写其原始上下文。
- 同步协议：使用真实的 `project.version`、`project.snapshot` 和 `server_time` 响应形态验证快照与归档版本。
- 集成边界：服务和本机引擎均为模拟依赖，真实桌面数据库由独立集成验收覆盖。

## 五、依赖与集成点

- 外部依赖：React、Ant Design、Vitest、Testing Library。
- 内部依赖：团队协作服务、用户权限状态、睿眼组件与通知函数。
- 服务端契约：测试数据使用 `content` 和 `metadata`；测试结果可携带 `test_data_id`。
- 页面输出：列表摘要、详情正文、元数据、状态、严重级别及错误或空状态。

## 六、技术选择

- 直接扩展现有团队协作页面，减少跨模块状态和重复接口。
- 详情按需读取，避免列表响应承载大正文。
- 关联测试数据采用现有服务端编号，保持服务端引用校验。
- 请求序号只处理界面竞态，不改变服务端版本控制。

## 七、风险

- 当前页面测试模拟在线接口，不能证明真实网络、数据库或两个桌面实例。
- 项目归档恢复、插件写入与本次测试正文交互属于不同链路。
- 页面文件存在一项既有 Hook 依赖警告，当前未发现由本次改动引入的错误。

## 八、并发状态修订依据

- `TeamCollaborationPage.openRecordDetail` 使用递增请求编号，只有当前详情请求能够写入正文、错误和加载状态。
- `HTTPFlowRuleDataFilter.fetchRuleNameOptions` 使用独立请求编号，过滤较早返回的规则名称响应。
- `HTTPFlowRuleDataFilter.refreshRuleData` 在成功、失败和结束分支都校验请求编号，避免旧请求改写新列表或加载状态。
- 记录创建后的列表刷新需要同时校验保存请求编号与团队项目上下文；团队或项目变化后，旧响应不得改写当前列表和错误。
- 项目同步与记录保存属于独立操作，不能共用同一个加载字符串；记录保存状态需要保持到对应创建请求结束。
- 文件型记录的列表响应可能省略正文并保留 `file_size` 或 `content_hash`，列表应提示用户从详情读取正文。
- 项目同步的真实响应将版本与快照放在 `project` 对象，服务时间放在顶层 `server_time`；快照读取完成前不能开放编辑提交。
- 项目往返切换使用团队和项目标识判断创建结果归属，不能依赖项目对象引用是否相同。
- 项目归档恢复和快照更新共用真实同步版本，避免嵌套响应被误读为零版本。
