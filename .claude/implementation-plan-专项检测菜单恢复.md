# 专项检测菜单恢复实施计划

生成时间：2026-07-28 10:59:05 +08:00

**目标：** 恢复专项检测菜单及原有页面路由，同时继续关闭专项检测内的分组筛选模式。

**方案：** 菜单模型不再为已交付的专项检测附加关闭状态功能标志，导航组件不再把
`YakitRoute.PoC` 转向通用检测。专项检测页面继续消费独立的 `showGroupSelection: false` 策略，
在选项生成阶段排除分组模式并停止渲染分组组件。

**技术栈：** React、TypeScript、Vitest、Testing Library、现有睿眼菜单模型。

## 全局约束

- 只修改渲染端菜单、导航、相关测试和任务记录。
- 不使用样式隐藏，不新增依赖，不修改公共分组能力和服务端协议。
- 保留此前代理控制台、内容规则、下游代理、免配置启动、交互代理筛选与快捷操作、插件作者及项目路径改动。
- 所有实现与验证均在本地 `qsh` 分支执行。

## 任务一：建立菜单回归测试

**文件：**

- 修改：`app/renderer/src/main/src/routes/__test__/renyanMenu.test.ts`

**接口：**

- 消费：`buildRenyanMenu()`、`flattenRenyanMenu()`。
- 验证：默认漏洞检测菜单包含 `targeted-vulnerability`，其路由为 `YakitRoute.PoC`。

- [x] 将漏洞检测二级菜单期望恢复为六项。
- [x] 将专项检测键的期望改为存在，并断言真实路由。
- [x] 执行目标测试，确认当前实现因菜单过滤而失败。

## 任务二：建立导航回归测试

**文件：**

- 修改：`app/renderer/src/main/src/pages/layout/renyanMenu/__test__/RenyanNavigation.test.tsx`

**接口：**

- 消费：`RenyanNavigation` 的真实菜单渲染与 `onMenuSelect` 回调。
- 验证：专项检测按钮进入 `YakitRoute.PoC`，当前路由为 `PoC` 时保持专项检测选中且不重定向。

- [x] 恢复专项检测按钮存在和可点击的断言。
- [x] 点击专项检测并断言回调路由为 `YakitRoute.PoC`。
- [x] 将原通用检测回退测试改为不重定向测试。
- [x] 执行目标测试，确认当前实现出现预期失败。

## 任务三：实施最小修复

**文件：**

- 修改：`app/renderer/src/main/src/config/renyanUiPolicy.ts`
- 修改：`app/renderer/src/main/src/routes/renyanMenu.ts`
- 修改：`app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx`

**接口：**

- 保留：`RUIYAN_UI_POLICY.vulnerabilityDetection.showGroupSelection`。
- 删除：专项检测整体隐藏策略、对应菜单功能标志和 `PoC` 路由回退分支。
- 保持：`YakitRoute.PoC` 到 `YakPoC` 的既有路由注册。

- [x] 删除 `showSpecialDetection`。
- [x] 删除 `specialVulnerabilityDetection` 类型、默认值和菜单项绑定。
- [x] 删除 `YakitRoute.PoC` 的通用检测回退分支。
- [x] 不修改 `YakPoC` 已有关键词归一化与分组条件渲染。

## 任务四：本地验证与复核

**文件：**

- 更新：`.claude/operations-log.md`
- 更新：`.claude/coding-log.md`
- 更新：`.claude/verification-report.md`

- [x] 执行菜单、导航和界面策略定向测试。
- [x] 执行 TypeScript 检查和相关文件 ESLint。
- [x] 在 `app/renderer/src/main` 执行 `yarn build`。
- [x] 执行可用测试命令并记录完整结果。
- [x] 执行 `git diff --check`、`git diff` 和分支检查。
- [x] 确认最终源码差异仅涉及本次错误修复，其他界面策略值保持原状。

## 验收标准

- 漏洞检测二级菜单显示专项检测，点击后进入 `YakitRoute.PoC`。
- 专项检测路由不触发通用检测导航。
- 页面仍只有关键词模式，分组按钮与分组组件均不渲染，旧分组状态归一为关键词模式。
- 通用检测及漏洞检测其他页面不变，此前九类界面调整保持。
- 定向测试、类型检查、构建与差异检查具有最新本地结果。

## 回退方式

本次变更只撤销前次提交中的三个错误控制点。需要回退时可恢复对应功能标志与导航分支；不涉及数据迁移、
接口变更或生成文件。
