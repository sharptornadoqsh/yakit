# 项目上下文摘要（客户端构建可选删除记录类型错误）

生成时间：2026-07-27 07:45:25 +08:00

## 一、目标、范围与验收条件

- 目标：修复全部客户端渲染器构建共有的三处 `TS18048`，保持项目同步与删除记录合并行为不变。
- 范围：`TeamCollaborationPage.tsx` 中 `loadSync` 对 `tombstones` 三个数组字段的读取，以及对应的本地验证记录。
- 交付物：源码修正、上下文摘要、实施计划、操作记录和验证报告。
- 验收条件：定向测试成功；完整 TypeScript 检查无诊断；目标代码规范与格式检查成功；企业版和企业免授权版组合构建成功；社区版由推送后的 GitHub Actions 验证；差异只包含任务相关内容。

## 二、失败复现与根本原因

- `yarn ci:tsc` 使用 TypeScript `5.1.6`，稳定报告 `TeamCollaborationPage.tsx` 第 415、416、417 行三处 `TS18048`。
- 三处代码均采用 `Array.isArray(tombstones?.field) ? tombstones.field : []`。条件中的可选链只保护该条件表达式，真分支改用直接属性访问后，编译器仍将 `tombstones` 视为可能未定义。
- `ProjectSync.tombstones` 在服务类型中明确为可选字段，旧服务响应不含该字段属于既有兼容契约。
- 最近提交 `dcf91c009` 引入三处表达式；这不是依赖缓存、操作系统或签名阶段造成的失败。
- 浏览器列表数据库过期只产生警告，致命退出来自 TypeScript 编译错误。

## 三、相似实现分析

- `TeamCollaborationPage.tsx` 的 `getList`：在同一个可选链表达式上检查并返回数组，用于不可信响应的数组规范化。
- `TeamCollaborationPage.tsx` 的 `getSyncedProject`：先取得局部属性，再检查数组与对象形态，避免在未确认父对象时直接读取。
- `TeamCollaborationPage.tsx` 的 `formatProjectSnapshot`：先保存局部值，再完成空值、数组和对象检查，保持输入规范化边界清晰。
- `AIChatListItem.tsx` 的四个列表读取函数：先确认目标字段为数组，再返回该字段，否则返回空数组。
- 初始方案尝试让条件和真分支都使用 `tombstones?.field`。TypeScript 随后将结果推断为“数组或未定义”，诊断移动到结果变量的长度读取处，因此该方案被验证否定。
- 最终方案与 `getSyncedProject` 的局部规范化模式一致：读取字段前使用空对象作为缺失值默认值，再沿用原有数组检查。该方案只改变类型可达性，不新增函数、断言或运行时分支。

## 四、项目约定与可复用组件

- 命名采用组件大驼峰、函数与变量小驼峰；源码使用两个空格、单引号、无分号和尾随逗号。
- `mergeSyncedRecords` 负责将服务端变更与删除记录合并到当前状态，继续原样复用。
- `getProjectSync` 负责读取项目同步响应，继续保留响应包装与直接响应两种形态。
- 测试位于相邻 `__test__` 目录，使用 Vitest、Testing Library 与 `jsdom`。

## 五、测试策略

- 红灯证据：修正前 `yarn ci:tsc` 退出码非零，仅报告三处目标错误。
- 行为基线：`TeamCollaborationPage.test.tsx` 与 `teamCollaboration.test.ts` 共三十二项测试成功。
- 删除记录行为已有页面测试覆盖三个集合的移除；缺失 `tombstones` 的旧响应已有服务测试和页面默认同步响应覆盖。
- 本次不新增重复的行为测试；`yarn ci:tsc` 是能够捕获该编译回归的直接自动化门槛。
- 修正后重复执行定向测试、完整类型检查、目标代码规范检查、格式检查与差异空白检查，并执行企业版和企业免授权版组合构建。社区版首次执行已生成主界面与启动页产物，但工具未保留最终退出码；用户要求停止重复构建并交由 GitHub Actions 验证。

## 六、依赖与集成点

- 输入：`getProjectSync` 返回的 `ProjectSync` 或兼容的直接响应对象。
- 规范化：`loadSync` 将变更数组与删除记录数组转换为 `ApiEntity[]`。
- 状态输出：`setProjectMembers`、`setTestData` 和 `setTestResults` 通过 `mergeSyncedRecords` 更新界面状态。
- 构建入口：社区版、企业版、企业免许可证版及其他产品变体都以不同环境变量调用同一 `react-app-rewired build`，并编译相同的主渲染器源码。
- 工作流平台：macOS、Windows 与 Linux 各任务重复调用同一版本构建分支，因此源码类型错误会影响全部平台。

## 七、资料与工具状态

- TypeScript 官方可选链说明：`https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7`，用于确认可选链短路范围。
- TypeScript 官方类型缩窄说明：`https://www.typescriptlang.org/docs/handbook/2/narrowing.html`，用于确认控制流缩窄边界。
- 当前环境未提供 `context7` 与 `shrimp-task-manager`；前者以 TypeScript 官方文档替代，后者以本地任务计划替代。
- `github.search_code` 因远端速率限制失败；项目内 CodeGraph 与四个相似实现提供了直接代码依据。

## 八、风险与回滚

- 运行时风险低：真分支仍返回同一字段，缺失父对象时将其规范化为空对象，缺失字段时仍返回空数组。
- 性能影响为零：没有增加遍历、网络、文件输入输出或依赖。
- 主要风险是遗漏某一同型字段，因此三处表达式必须同步修正，并以完整 TypeScript 检查验证。
- 回滚方式：恢复 `TeamCollaborationPage.tsx` 中 `tombstones` 的原始可选类型声明；任务文档可随源码一并恢复。
