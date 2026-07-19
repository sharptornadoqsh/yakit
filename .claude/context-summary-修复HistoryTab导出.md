# 项目上下文摘要（修复 HistoryTab 导出）

生成时间：2026-07-17 22:31:55 +08:00

## 一、目标与范围

- 修复 `HTTPHistoryFilter.tsx` 导入 `HistoryTab` 时出现的命名导出缺失错误。
- 保留当前工作区的一百一十四份受跟踪文件差异与五份未跟踪任务摘要，不撤销既有界面重构。
- 修改范围限定为 `HTTPHistory.tsx` 的公共导出及本任务记录；不启动开发服务，不执行完整构建、打包、全仓测试或全仓代码规范检查。

## 二、现状与中断点

- 当前分支为 `qsh`，状态中没有未合并条目，也没有中断产生的临时文件条目。
- `HTTPHistoryFilter.tsx` 未发生工作区修改，仍从 `@/components/HTTPHistory` 导入 `HistoryProcess` 与 `HistoryTab`，并把 `HistoryTab` 传给 `YakitSideTab`。
- `HTTPHistory.tsx` 的界面重构已将自身左侧标签改为抽屉内分段控件，但差异同时删除了原有 `export const HistoryTab`。
- 基线版本明确导出 `HistoryTab`；当前版本仍导出 `HTTPFlowRealTimeTableAndEditor`、`HTTPHistory`、`HistoryProcess` 与 `iconProcessMap`，唯独缺少该标签常量。

## 三、相似实现与项目约定

- `YakRunnerAuditHole.tsx` 使用导出的 `YakitTabsProps[]` 常量，供同模块及外部消费者复用。
- `SinglePluginExecution.tsx` 使用模块内 `YakitTabsProps[]` 常量，标签项由 `label` 与 `value` 构成。
- `RunnerFileTree.tsx` 使用模块内 `YakitTabsProps[]` 常量，并直接传给 `YakitSideTab`。
- `YakitSideTabType.d.ts` 要求 `yakitTabs` 为 `YakitTabsProps[]`，其中 `label` 与 `value` 必填，`icon` 可选。
- 文件继续采用组件与类型大驼峰、变量小驼峰、两个空格、单引号、无分号和尾随逗号。

## 四、复用项与集成关系

- 复用 `YakitTabsProps`，不创建新的标签类型。
- 复用既有四枚轮廓图标及原有四个标签值：`web-tree`、`process`、`rules`、`ai`。
- 保持消费者导入路径、活动标签状态、远程设置和筛选分支不变。
- 该常量只提供静态界面元数据，不改变查询、进程标签、规则筛选或人工智能会话逻辑。

## 五、技术选择

- 在原模块恢复既有命名导出，维持已经存在的公共接口。
- 不把常量复制到消费者，也不增加新模块，以免扩大差异并形成重复定义。
- 不恢复已被新界面替代的 `HTTPHistory` 旧侧栏结构，确保现有界面重构成果保持不变。

## 六、验证策略与风险

- 使用格式检查和 TypeScript 语法树解析检查目标文件。
- 使用静态模块契约脚本检查 `HistoryTab` 的命名导出、四个标签值和消费者导入。
- 对目标文件执行局部代码规范检查，并执行 `git diff --check`。
- 不执行完整 Webpack 构建；最终结论限于导致当前遮罩页的命名导出错误，运行期引擎连接日志不在本次源码修改范围内。

## 七、充分性检查

- 输入输出契约明确：生产者导出 `YakitTabsProps[]`，消费者作为 `YakitSideTab.yakitTabs` 使用。
- 技术选择明确：恢复既有导出，避免迁移消费者与扩大模块范围。
- 风险明确：主要风险为图标或标签值遗漏，可由静态契约与局部解析覆盖。
- 验证方式明确：格式、解析、局部代码规范、静态契约和差异空白检查。
