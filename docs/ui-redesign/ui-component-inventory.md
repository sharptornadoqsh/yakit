# 睿眼登录后界面组件清单

## 新增公共组件

| 能力 | 组件与源文件 | 集成位置 | 状态与约束 |
| --- | --- | --- | --- |
| 登录后应用框架 | `RuiYanAppShell`、`RuiYanTopCommandBar`、`RuiYanPrimaryNav`、`RuiYanSecondaryNav`；`app/renderer/src/main/src/components/renyanUI/RuiYanShell.tsx` | `MainOperator` 登录后主区域 | 已实施；统一顶部、两级导航和工作区，只展示真实路由或真实动作 |
| 路由视觉上下文 | `RuiYanPage`、`RuiYanVisualContext`；`app/renderer/src/main/src/components/renyanUI/RuiYanPage.tsx`、`RuiYanVisualContext.tsx` | 主路由内容挂载点 | 已实施；只决定页面视觉类别，不改变路由参数或业务状态 |
| 桌面窗口标题栏 | `RenyanWindowChrome`；`app/renderer/src/main/src/components/layout/RenyanWindowChrome.tsx` | Electron 登录后窗口 | 已实施；保留最小化、最大化和关闭事件 |
| 底部任务中心 | `RenyanTaskCenter`；`app/renderer/src/main/src/components/layout/RenyanTaskCenter.tsx` | `RenyanStatusBar` | 已实施；由状态栏向上展开，读取 `apiFetchQueryAllTask`，不创建任务样本 |
| 页面结构原语 | `RuiYanPageHeader`、`RuiYanToolbar`、`RuiYanPageFrame`、`RuiYanDetailPanel`、`RuiYanCodeEditorFrame` | 流量、报告、扫描、漏洞和审计页面 | 已实施；用于标题、操作区、详情区及报文编辑区的统一结构 |
| 交互与数据原语 | `RuiYanButton`、`RuiYanIconButton`、`RuiYanPanel`、`RuiYanSplitPane`、`RuiYanDataTable`、`RuiYanFilterPanel`、`RuiYanTabs`、`RuiYanStatusBadge` | 新框架和适配页面 | 已实施；组件只处理展示和交互，不复制业务查询 |
| 状态与浮层原语 | `RuiYanEmptyState`、`RuiYanLoadingState`、`RuiYanErrorState`、`RuiYanModal`、`RuiYanDrawer`、`RuiYanConfirmDialog` | 登录后工作区 | 已实施；包含退出键、焦点循环、焦点恢复和遮罩关闭行为 |

## 修改与扩展的公共组件

| 组件 | 源文件 | 改造内容 | 保留行为 |
| --- | --- | --- | --- |
| 主内容和导航挂载 | `app/renderer/src/main/src/pages/MainOperator.tsx`、`app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.tsx` | 挂载新框架、视觉上下文和统一内容边界 | 原有页面缓存、路由切换和页签事件 |
| 状态栏 | `app/renderer/src/main/src/components/layout/RenyanStatusBar.tsx` | 改为全宽深色状态栏，并承载任务入口 | 引擎、项目和团队真实状态来源 |
| 页面标题 | `app/renderer/src/main/src/components/layout/RenyanPageHeader.tsx` | 统一标题、面包屑与操作区 | 原有页面标题参数 |
| 消息中心 | `app/renderer/src/main/src/components/MessageCenter/MessageCenter.tsx` | 适配顶部右侧面板并同步未读状态 | 查询、分页、单条已读、全部已读、清理、套接字刷新和任务通知 |
| 既有模态框 | `app/renderer/src/main/src/components/yakitUI/YakitModal/yakitModal.module.scss`、`YakitModalConfirm.tsx` | 登录后作用域内统一标题、边框、正文和操作区 | 命令式调用签名和销毁语义 |
| 既有抽屉 | `app/renderer/src/main/src/components/yakitUI/YakitDrawer/YakitDrawer.module.scss` | 登录后作用域内统一尺寸、边框和层级 | 原有可见状态、关闭回调和挂载容器 |
| 提示与空状态 | `app/renderer/src/main/src/components/yakitUI/YakitHint/YakitHint.tsx`、`YakitHint.module.scss` | 适配紧凑政企工作区视觉 | 原有错误、警告、加载和空状态语义 |

## 直接复用的既有组件

| 复用类别 | 既有组件或模块 | 复用位置 | 复用边界 |
| --- | --- | --- | --- |
| 页面缓存与路由 | `MainOperatorContent`、`YakitRoute`、事件总线 | 登录后所有业务页 | 保留现有路由键、页签缓存、页面参数和事件名称 |
| 表单与基础控件 | `YakitButton`、`YakitInput`、`YakitSelect`、`YakitForm`、`YakitCheckbox` | 系统设置、扫描、插件、项目和工具页 | 只通过登录后主题作用域改变外观，不复制校验和提交逻辑 |
| 高密度表格 | `YakitVirtualList`、`YakitTable`、`HTTPFlowTable` | 流量、扫描、风险、报告和任务列表 | 保留虚拟滚动、列配置、排序、分页及选中模型 |
| 编辑器与报文 | `YakitEditor`、`HTTPFlowDetail`、`HTTPFuzzerPage` | 报文详情、重放、差异和插件编辑 | 保留编辑器实例、报文模型、快捷键和进程通信 |
| 公共浮层 | `YakitModal`、`YakitDrawer`、`YakitPopover`、`YakitDropdownMenu`、`YakitTooltip` | 旧业务页及其内部操作 | 不改变调用签名；通过统一作用域适配边框、层级和间距 |
| 消息与任务数据 | `MessageCenter` 和 `components/MessageCenter/utils.ts` | 顶部消息面板与底部任务中心 | 复用查询、已读、清理、套接字和任务接口 |
| 插件与扫描执行 | `PluginHub`、`HybridScanExecuteContent`、`PluginBatchExecuteExtraParams` | 插件仓库、通用扫描和策略配置 | 保留插件来源、运行参数、任务令牌、暂停、恢复和取消 |
| 报告与风险详情 | `ReportViewerPage`、`YakitRiskTable`、`YakitAuditHoleTable` | 报告、漏洞和处置工作区 | 仅适配外层结构，继续使用真实查询、详情和处置数据 |

## 登录后主题与浮层边界

`app/renderer/src/main/src/theme/renyan.scss` 在 `RuiYanAppShell` 挂载期间增加 `ruiyan-workspace-active` 页面作用域，统一下拉菜单、提示、气泡卡片、通知、消息、加载、分页、表格、表单和第三方浮层。工作区退出后移除作用域，不污染企业登录页。

登录方式弹窗、私有域服务地址配置及管理页面独立根节点被明确排除。用户管理页的四处列宽是用户反馈“看不到用户信息”后授权的显示调整，不改变字段、查询、操作或账号服务响应。

## 设计变量

统一变量集中于 `theme/renyan.scss`，覆盖窗口标题栏高度、导航宽度、顶部栏高度、底部栏高度、页面间距、面板内边距、圆角、表格行高、主色、状态色、边框、工作区、表面、正文和次级文字。业务页面不得自行创建同义颜色和尺寸变量。

| 变量 | 当前值或组成 | 用途 |
| --- | --- | --- |
| `--ruiyan-shell-sidebar-width` | `220px` | 一级与二级导航总宽度 |
| `--ruiyan-shell-primary-width` | `64px` | 一级导航宽度 |
| `--ruiyan-shell-secondary-width` | `156px` | 二级导航宽度 |
| `--ruiyan-window-chrome-height` | `32px` | 窗口标题栏高度 |
| `--ruiyan-shell-topbar-height` | `52px` | 顶部工具栏高度 |
| `--ruiyan-shell-status-height` | `32px` | 底部状态栏高度 |
| `--ruiyan-shell-content-top` | 标题栏与工具栏高度之和 | 门户浮层顶部边界 |
| `--ruiyan-page-gap` | `16px` | 页面主间距 |
| `--ruiyan-panel-padding` | `16px` | 内容面板内边距 |
| `--ruiyan-table-row-height` | `38px` | 高密度表格行高 |
| `--ruiyan-radius-sm` | `2px` | 输入框、按钮与紧凑控件圆角 |
| `--ruiyan-radius-md`、`--ruiyan-radius-lg` | `4px` | 面板、弹窗与抽屉圆角 |
| `--ruiyan-color-primary`、`--ruiyan-color-on-primary` | `#1d63b3`、`#ffffff` | 主操作及其前景色 |
| `--ruiyan-color-nav`、`--ruiyan-color-nav-panel` | `#102a44`、`#163550` | 两级导航表面 |
| `--ruiyan-color-nav-active`、`--ruiyan-color-nav-indicator` | `#1c5fa8`、`#8ec2f3` | 导航选中状态 |
| `--ruiyan-color-success`、`--ruiyan-color-warning`、`--ruiyan-color-danger` | 绿色、橙色、红色状态变量 | 状态与风险语义 |
| `--ruiyan-color-background`、`--ruiyan-color-surface` | `#f2f4f7`、`#ffffff` | 工作区与内容面板表面 |

## 真实数据与协议边界

| 业务边界 | 通道类型 | 保留的真实调用或模型 | 相关页面 |
| --- | --- | --- | --- |
| HTTP 代理与拦截 | 远程过程调用封装与既有事件 | `grpcMITMStartCall`、代理事件、劫持/放行/丢弃动作及原数据结构 | 代理拦截、规则、证书和历史流量 |
| HTTP 流量详情 | Electron 进程间通信 | `GetHTTPFlowById`、历史查询和编辑器模型 | 历史流量、报文详情和重放 |
| 扫描 | 应用接口封装与远程过程调用流 | `apiHybridScan`、`apiHybridScanByMode`、`apiCancelHybridScan`、`QuerySyntaxFlowScanTask` | 通用扫描、扫描向导、策略和结果 |
| 插件 | Electron 进程间通信与网络应用接口 | 本地插件查询、线上插件查询与下载、导入流式事件 | 插件仓库、详情和批量导入 |
| 项目 | Electron 进程间通信 | `GetProjects`、`ImportProject`、`ExportProject` 及传输事件 | 项目管理与数据导入导出 |
| 报告 | Electron 进程间通信 | `QueryReports`、`QueryReport`、`PrintReportPdfFromTemplate` 和既有生成事件 | 报告中心、预览、生成和导出 |
| 字典测试 | 应用接口封装与流式远程过程调用 | `apiStartBrute` 及流式进度 | 字典测试 |
| 编解码与哈希 | Electron 进程间通信 | `GetAllCodecMethods` 及既有方法执行通道 | 编解码和哈希摘要 |
| 消息与任务 | 网络应用接口与套接字 | `apiFetchQueryMessage`、`apiFetchMessageRead`、`apiFetchMessageClear`、`apiFetchQueryAllTask` 及套接字事件 | 顶部消息面板和底部任务中心 |
| 证书 | Electron 进程间通信与配置模型 | `GlobalNetworkConfig.ClientCertificates`、`MITMAddTLS`、字节数组与容器格式校验 | 全局设置和代理证书入口 |

本次界面改造没有修改进程通信通道名、远程过程调用参数、协议定义、后端返回结构或数据库结构。页面二十七与三十九没有可确认的产品协议，页面三十一没有项目级密令协议，因此这些项目只记录能力边界，不新增模拟数据或不可执行按钮。

## 重点业务页面适配

| 页面类别 | 修改文件 | 结构变化 |
| --- | --- | --- |
| 请求响应详情 | `app/renderer/src/main/src/components/HTTPFlowDetail.tsx`、`hTTPFlowDetail.module.scss` | 页面标题、双报文框、可缩放分栏和窄窗纵向布局 |
| 报告 | `app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.tsx`、`ReportViewerPage.module.scss` | 左侧报告列表、右侧预览和统一操作区 |
| 扫描历史 | `app/renderer/src/main/src/pages/yakRunnerScanHistory/YakRunnerScanHistory.tsx`、`YakRunnerScanHistory.module.scss` | 标题、查询工具栏、任务表格和详情分栏 |
| 漏洞 | `app/renderer/src/main/src/pages/risks/YakitRiskTable/YakitRiskTable.tsx`、`YakitRiskTable.module.scss` | 高密度工具栏、表格、固定详情面板 |
| 审计漏洞 | `app/renderer/src/main/src/pages/yakRunnerAuditHole/YakitAuditHoleTable/YakitAuditHoleTable.tsx`、`YakitAuditHoleTable.module.scss` | 漏洞列表、详情、评论和处置区统一 |
| 系统设置 | `app/renderer/src/main/src/components/configNetwork/ConfigNetworkPage.tsx`、`ConfigNetworkPage.module.scss` | 分组表单改为文档流、滚动内容与底部操作区分离，消除区域重叠 |
| 报文差异 | `app/renderer/src/main/src/pages/compare/DataCompare.tsx` | 生命周期保护，避免对空编辑器实例调用 `dispose` |

## 保护范围

- 企业登录、私有域配置、角色管理、组织管理和权限管理已恢复到界面改造前基线。
- `AccountAdminPage.tsx` 只有四处用户授权的列宽调整；用户名、组织、角色和创建时间的数据源及操作没有变化。
- 主进程、协议、数据库、引擎二进制和生成目录没有进入当前界面提交。
- 工作区中仍存在任务开始前遗留的主进程、配置与 `UILayout.tsx` 未提交差异，本任务不覆盖、不暂存、不提交这些文件。

## 静态测试入口

参考测试包括 `renyanMenu.test.ts`、`RenyanNavigation.test.tsx`、`RuiYanPrimitives.test.tsx`、`RenyanWindowChrome.test.tsx`、`RuiYanVisualContext.test.ts`、`RuiYanShell.test.tsx` 与 `RenyanTaskCenter.test.tsx`。已执行的聚焦测试覆盖路由视觉映射、登录后浮层作用域、真实任务读取、状态转换、面板开关和消息未读联动。用户要求暂不编译，因此本阶段没有执行渲染器构建、完整类型检查、服务启动或安装包构建。
