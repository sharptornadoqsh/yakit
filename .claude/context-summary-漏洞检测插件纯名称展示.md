# 项目上下文摘要（漏洞检测插件纯名称展示）

生成时间：2026-07-28 15:32:55 +08:00

## 一、目标、范围与交付物

本任务将漏洞检测模块中的插件身份展示统一为纯名称形式。专项检测的已选插件列表只保留插件名称，
移除头像、类型徽标、云端或私有标识、说明入口和源码入口；已选插件面板不再提供“插件日志”页签。
通用检测与端口检测的插件候选列表保留复选框、名称、检索、过滤和选择行为，仅移除身份装饰与快捷入口。

改动限定在共享插件行的可选展示模式、共享本地插件列表的参数透传，以及漏洞检测三个调用入口。
插件中心、插件仓库、插件开发、插件详情和单插件执行继续使用原有完整展示。插件对象、标识、查询参数、
选择状态、执行参数、执行进度和服务端接口保持原状。

## 二、现状定位

- `app/renderer/src/main/src/pages/plugins/baseTemplate.tsx`
  - `PluginDetailsListItem` 统一渲染作者头像或插件类型徽标、插件名称、来源标识、说明浮层和源码浮层。
  - 该组件同时被漏洞检测、插件管理、单插件执行和聊天插件选择复用，不能直接改变默认表现。
- `app/renderer/src/main/src/pages/plugins/operator/PluginLocalListDetails/PluginLocalListDetails.tsx`
  - 通用检测、端口检测和单插件执行共用此列表。
  - 列表本身负责完整插件对象、全选、单选、过滤与分页；显示模式不应介入这些数据路径。
- `app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx`
  - `PluginListByGroup` 渲染专项检测已选插件，并额外查询私有域以决定来源图标。
  - `YakPoCExecuteContent` 维护“已选插件／插件日志”切换状态，并把流式插件日志传给页签内容。
  - 文件底部导出的 `PluginExecuteLog` 仍由通用检测用于执行进度，不属于本次删除范围。

## 三、相似实现与可复用模式

- `app/renderer/src/main/src/pages/plugins/manage/PluginManageDetail.tsx`
  - 直接使用 `PluginDetailsListItem` 的完整模式，代表插件管理页面必须维持的默认表现。
- `app/renderer/src/main/src/pages/plugins/singlePluginExecution/SinglePluginExecution.tsx`
  - 通过 `PluginLocalListDetails` 使用完整模式，证明共享列表参数必须采用可选值且默认不变。
- `app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/pluginBatchExecutor.tsx`
  - 通用检测通过共享本地列表管理复选框、完整插件对象和执行参数，是纯名称模式的一个显式入口。
- `app/renderer/src/main/src/pages/securityTool/newPortScan/NewPortScan.tsx`
  - 端口检测复用同一列表，是纯名称模式的另一个显式入口。
- `app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx`
  - 专项检测直接使用共享插件行且关闭复选框，是已选插件纯名称模式的显式入口。

## 四、项目约定

- React 组件和类型采用大驼峰，函数与变量采用小驼峰。
- TypeScript 使用两个空格、单引号、无分号和尾随逗号。
- 测试位于相邻 `__test__` 目录，使用 Vitest、Testing Library 与 `jsdom`。
- 生产代码修改使用 `apply_patch`，不新增依赖，不进行无关格式整理。
- 当前工作分支为 `qsh`，研究开始时工作树无修改。

## 五、接口、依赖与集成点

- 为 `PluginDetailsListItemProps` 增加可选 `displayMode`，默认值保持完整展示。
- 为 `PluginLocalListDetailsProps` 增加同名可选参数，并原样传递给每个插件行。
- 通用检测、专项检测和端口检测显式传入纯名称模式；单插件执行及其他调用方不传入。
- 纯名称模式只改变条件渲染：保留可选复选框、名称、行点击、选中态、插件对象和回调参数。
- 专项检测移除页签状态和页签内容，不删除流式日志类型、通用执行日志组件或执行状态处理。

## 六、测试策略

1. 为 `PluginDetailsListItem` 增加组件测试，要求纯名称模式不生成头像与操作容器，同时保留名称、复选框和完整回调对象。
2. 增加默认模式回归断言，要求未传入显示模式时仍渲染头像与操作容器。
3. 为专项检测执行内容增加组件测试，要求选中插件面板不出现“插件日志”，且插件行使用纯名称模式。
4. 在生产代码修改前执行新增测试，记录预期失败。
5. 实施后执行新增测试、相关既有测试、类型检查、规则检查、生产构建和差异检查。

## 七、技术选择与风险

- 采用共享组件的显式可选模式，避免复制插件行，也避免改变插件中心等模块的默认表现。
- 不采用样式隐藏；头像、徽标、图标、浮层和页签内容均在组件生成阶段停止渲染。
- 纯名称模式不读取插件内容或帮助文本用于界面，但完整插件对象仍传给选择与执行路径。
- 专项检测已选列表不再需要私有域查询，可移除该列表自身的来源标识派生；共享候选列表仍保留原查询，
  以保障默认完整模式调用方行为。
- 主要风险是共享组件默认行为回归和专项检测执行状态耦合，分别由默认模式测试与专项页面测试约束。

## 八、工具与资料说明

CodeGraph 索引有效，已用于分析共享插件行、调用路径和影响范围。桌面文件工具用于源码与测试结构读取。
当前工具集中未发现 `shrimp-task-manager`，使用本地实施计划与会话计划管理工作。改动不涉及第三方库新用法，
外部库文档和开源实现不构成实施前提。

## 九、上下文充分性结论

已定位三个漏洞检测入口、三个以上相似调用、共享组件边界、专项日志复用关系、测试框架和验证命令。
现有信息能够支持测试先行、最小生产改动和跨模块默认行为复核。
