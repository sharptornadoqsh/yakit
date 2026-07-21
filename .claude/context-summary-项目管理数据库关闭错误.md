# 项目管理数据库关闭错误上下文摘要

生成时间：2026-07-19 21:12:00 +08:00

## 目标与验收条件

- 打开项目管理后，已经缓存的业务页面停止访问已关闭的项目数据库。
- 项目管理弹窗保持现有睿眼结构，旧产品分支保持原设置页面结构。
- 关闭项目管理或选择项目后，业务页面重新创建并使用当前数据库。
- 不隐藏真实查询错误，不修改项目、风险或引擎协议。

## 三项相关实现

- `components/layout/UILayout.tsx`：进入项目管理时调用 `setCurrentProject({ Type })`；当前睿眼分支将项目管理改为同级弹窗，却继续渲染 `props.children`。
- `pages/layout/mainOperatorContent/MainOperatorContent.tsx`：访问过的页面仅通过 `display: none` 隐藏，副作用保持活动状态。
- `pages/plugins/operator/pluginExecuteResult/PluginExecuteResult.tsx`：风险页签没有取得正数总量前，每秒调用一次 `apiQueryRisksTotalByRuntimeId`。

## 调用链与原因

项目管理入口经菜单事件进入 `UILayout.changeYakitMode`，确认后执行 `onOkEnterProjectMag`。该函数使当前项目数据库退出使用状态。背景业务树仍挂载时，插件结果组件继续调用 `QueryRisks`；查询工具对每次失败都创建通知，因此形成截图中的重复错误。

## 最小修改

- 恢复项目管理期间 `pageShowHome` 为假。
- `showProjectManage` 为真时，无论是否启用睿眼外壳，都不渲染 `props.children`。
- 睿眼分支继续使用现有 `RuiYanModal` 与 `ProjectManage`；旧分支继续使用 `SoftwareSettings`。

## 验证策略

- 对目标文件执行格式与局部代码规范检查。
- 使用回归测试固定“项目管理开启时不显示业务工作区”的判定。
- 检查差异仅涉及布局生命周期与对应测试、记录文件。
