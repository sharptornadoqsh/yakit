# 漏洞检测插件纯名称展示实施计划

生成时间：2026-07-28 15:32:55 +08:00

**目标：** 漏洞检测模块的插件条目仅显示插件名称；专项检测已选插件面板移除插件日志切换，
同时保留插件筛选、选择、执行、进度和底层数据。

**方案：** 在共享插件行与共享本地插件列表增加默认关闭的纯名称模式。三个漏洞检测入口显式启用，
其他调用方沿用完整模式。专项检测固定渲染已选插件列表，删除面板内日志页签状态与内容，
通用检测使用的执行日志组件继续保留。

**技术栈：** React、TypeScript、Vitest、Testing Library、现有插件列表组件。

## 全局约束

- 不使用样式隐藏，不新增第三方依赖，不修改服务端接口与插件模型。
- 不改变插件中心、插件仓库、插件开发、插件详情和单插件执行页面。
- 不改变插件选择、完整对象传递、执行参数、任务状态和执行进度。
- 所有实现与验证均在本地 `qsh` 分支进行，不提交或推送。

## 任务一：建立共享插件行回归测试

**文件：**

- 新增：`app/renderer/src/main/src/pages/plugins/__test__/PluginDetailsListItem.test.tsx`

**验收：**

- [x] 纯名称模式只生成名称和按配置保留的复选框。
- [x] 头像、类型徽标、来源图标、说明入口、源码入口及其容器均不生成。
- [x] 行点击和复选框回调仍接收完整插件对象。
- [x] 默认模式继续生成头像和右侧操作区。
- [x] 修改生产代码前执行测试并观察预期失败。

## 任务二：建立专项检测面板回归测试

**文件：**

- 新增：`app/renderer/src/main/src/pages/securityTool/yakPoC/__test__/YakPoCExecuteContent.test.tsx`

**验收：**

- [x] 有选中插件时显示“已选插件”、总数、清空入口和插件名称。
- [x] 不生成“插件日志”页签和对应内容。
- [x] 已选插件行不生成头像或右侧操作容器。
- [x] 执行组件仍取得完整筛选参数与状态回调。
- [x] 修改生产代码前执行测试并观察预期失败。

## 任务三：实施共享纯名称模式

**文件：**

- 修改：`app/renderer/src/main/src/pages/plugins/baseTemplateType.ts`
- 修改：`app/renderer/src/main/src/pages/plugins/baseTemplate.tsx`
- 修改：`app/renderer/src/main/src/pages/plugins/operator/PluginLocalListDetails/PluginLocalListDetailsType.d.ts`
- 修改：`app/renderer/src/main/src/pages/plugins/operator/PluginLocalListDetails/PluginLocalListDetails.tsx`

**验收：**

- [x] 增加可选 `displayMode`，默认值维持完整展示。
- [x] 纯名称模式通过条件渲染移除头像与整个操作区域。
- [x] 共享本地列表仅透传显示参数，不改选择、检索、分页和完整插件对象。
- [x] 默认调用方无代码变化。

## 任务四：启用漏洞检测入口并简化专项面板

**文件：**

- 修改：`app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/pluginBatchExecutor.tsx`
- 修改：`app/renderer/src/main/src/pages/securityTool/newPortScan/NewPortScan.tsx`
- 修改：`app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx`

**验收：**

- [x] 通用检测和端口检测候选列表开启纯名称模式，复选框与选择行为保留。
- [x] 专项检测已选列表开启纯名称模式，删除仅服务来源图标的查询和派生逻辑。
- [x] 专项检测已选面板固定显示插件列表，不再建立日志页签状态与日志视图。
- [x] 通用检测的 `PluginExecuteLog` 导出与执行进度显示保持。

## 任务五：本地验证与复核

**文件：**

- 更新：`.claude/operations-log.md`
- 更新：`.claude/coding-log.md`
- 更新：`.claude/verification-report.md`

**验收：**

- [x] 执行新增测试与相关既有测试。
- [x] 执行目标文件规则检查和完整类型检查。
- [x] 按用户指示终止耗时生产构建，并记录未完成的动态验证边界。
- [x] 执行格式检查、`git diff --check`、`git diff --stat` 和分支检查。
- [x] 复核默认完整模式调用方和此前界面隐藏策略没有变化。

## 回退方式

删除三个漏洞检测入口的 `displayMode` 参数即可恢复完整插件行；专项检测页签部分可从本次单一差异恢复。
本任务没有数据迁移、接口变更或生成文件提交。
