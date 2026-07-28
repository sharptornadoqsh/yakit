# 项目上下文摘要（专项检测菜单恢复）

生成时间：2026-07-28 10:59:05 +08:00

## 一、目标、范围与交付物

本任务修复提交 `0959b5b00` 引入的专项检测回归：恢复睿眼漏洞检测菜单中的“专项检测”，保持
`YakitRoute.PoC` 进入原有 `YakPoC` 页面，并继续隐藏该页面内的“按组选”模式及其分组内容。

改动限定在睿眼菜单模型、导航状态同步、相关回归测试与任务记录。不得修改通用检测、端口检测、扫描结果、
风险结果、安全测试报告、远程过程调用、协议定义、插件分组接口、插件组数据结构或公共分组组件。

## 二、错误定位

- `app/renderer/src/main/src/config/renyanUiPolicy.ts`
  - 前次新增 `showSpecialDetection: false`，其含义错误地扩大到隐藏整个专项检测入口。
  - 独立的 `showGroupSelection: false` 才是本需求应保留的页面级策略。
- `app/renderer/src/main/src/routes/renyanMenu.ts`
  - 前次为 `targeted-vulnerability` 增加 `specialVulnerabilityDetection` 功能标志。
  - `buildRenyanMenu` 会过滤默认值为假的功能标志，因此专项检测从菜单、路由标签和路径查找结果中消失。
- `app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx`
  - 前次为找不到菜单路径的 `YakitRoute.PoC` 增加回退处理，并调用通用检测的
    `YakitRoute.BatchExecutorPage`，导致历史专项检测页面被主动替换。
- `app/renderer/src/main/src/routes/newRoute.tsx`
  - `YakitRoute.PoC` 仍导入并渲染 `YakPoC`，页面组件和正式路由注册未被删除。

## 三、相似实现与可复用模式

- `app/renderer/src/main/src/routes/renyanMenu.ts`
  - 通用检测、端口检测、扫描结果等已交付页面直接声明真实路由，不附加关闭状态的功能标志。
  - `buildRenyanMenu`、`findRenyanMenuPath` 和 `buildRenyanRouteLabelMap` 共同消费同一菜单模型。
- `app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx`
  - 正常路由通过 `findRenyanMenuPath` 同步一级与二级菜单状态，不主动触发其他页面导航。
  - 只有系统设置分区具有独立状态恢复逻辑，专项检测不需要额外回退分支。
- `app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx`
  - 页面已经通过 `showGroupSelection` 在分段选项生成阶段排除 `group`。
  - `PluginGroupGrid` 已受条件渲染控制，关闭时不会建立分组列表、添加入口或分组选择控件。
  - `resolveRuiYanVulnerabilitySelectionType` 会把持久化的分组状态归一为 `keyword`。
- `app/renderer/src/main/src/config/__test__/renyanUiPolicy.test.ts`
  - 现有测试覆盖保存分组状态和普通初始化均返回 `keyword`，可继续保护刷新后的默认模式。
- `app/renderer/src/main/src/pages/layout/renyanMenu/__test__/RenyanNavigation.test.tsx`
  - 使用 Testing Library 验证真实二级菜单按钮、当前路由状态及导航回调，适合建立回归用例。

## 四、项目约定

- React 组件与类型采用大驼峰，函数和变量采用小驼峰。
- TypeScript 使用两个空格、单引号、无分号和尾随逗号。
- 测试位于相邻 `__test__` 目录，使用 Vitest 与 Testing Library。
- 代码修改使用 `apply_patch`，不进行无关格式化，不新增第三方依赖。
- 当前工作分支为 `qsh`，研究开始时工作树无修改。

## 五、输入输出与集成点

- 菜单输入为 `RENYAN_MENU_MODEL`、功能标志和能力集合，输出为睿眼一级、二级菜单及路由标签。
- 导航输入为 `currentPageTabRouteKey`，输出为菜单选中状态；当前路由同步不应产生页面跳转副作用。
- 专项检测输入包括页面缓存中的 `selectGroup` 和关键词组，输出只允许关键词模式参与可见筛选与执行参数。
- `newRoute.tsx` 是 `YakitRoute.PoC` 到 `YakPoC` 的现有集成点，本任务不修改该文件。

## 六、测试策略

1. 修改菜单测试，要求默认漏洞检测菜单重新包含“专项检测”且其路由为 `YakitRoute.PoC`。
2. 修改导航测试，要求专项检测按钮可点击进入 `YakitRoute.PoC`，当前路由为 `PoC` 时不发生通用检测重定向。
3. 在生产修改前执行上述测试，确认因现有功能标志和回退分支出现预期失败。
4. 删除错误的整体隐藏功能标志和导航回退分支，再执行定向测试。
5. 保留并执行界面策略测试，确认旧分组状态继续归一为关键词模式。
6. 执行类型检查、主渲染构建、可用测试命令、差异检查和代码审阅。

## 七、技术选择与风险

- 删除专项检测整体隐藏标志，而非将其默认值改为真，避免未来参数覆盖再次隐藏必须存在的入口。
- 保留 `showGroupSelection: false`，避免恢复菜单时同时恢复页面内分组模式。
- 不修改 `YakPoC` 的公共分组组件定义，只继续依靠专项检测页面的选项生成与条件渲染控制。
- 菜单模型恢复后，常规路径同步即可处理 `YakitRoute.PoC`，删除回退分支不会影响其他路由。
- 风险集中在菜单去重和活动项同步，使用菜单模型测试与真实导航组件测试覆盖。

## 八、工具与资料说明

CodeGraph 索引有效，已用于确认菜单、导航、页面组件和路由注册的调用关系。桌面文件工具用于读取提交差异、
测试脚本和本地文件。当前工具集中未发现 `shrimp-task-manager`，以本地实施计划和进度清单承担任务管理。
本修复不涉及第三方库用法或通用算法，因此不需要外部实现与库文档。

## 九、上下文充分性结论

已确认三个以上相关实现、实际错误提交、现有路由注册、页面级分组禁用逻辑、测试框架、输入输出边界和验证命令。
当前信息足以进入测试先行阶段。
