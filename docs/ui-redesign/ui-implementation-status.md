# 睿眼登录后界面实施状态

## 当前基线

- 当前工作分支：`qsh`。
- 代码图索引有效，索引文件一千七百七十个。
- 当前分支包含睿眼外壳、导航、页面视觉上下文和公共原语，界面提交只改变登录后的前端展示结构和必要的前端交互封装。
- 工作区仍有任务开始前遗留的主进程、渲染配置、`UILayout.tsx` 和本地记录文件差异；这些文件未被覆盖，也不会进入本次文档提交。
- 效果图目录共四十个文件、三十七个唯一画面，三组文件内容完全重复；目标清单中的页面三十一至三十三没有独立素材。
- 用户要求源代码修改结束后自行编译，因此当前阶段只执行非编译静态检查，不启动客户端、用户管理服务或引擎。

## 阶段状态

| 阶段 | 状态 | 主要产物 | 验证 |
| --- | --- | --- | --- |
| 仓库与效果图勘察 | 已完成 | 页面映射、组件清单、依赖与能力缺口 | 图片清点、代码图、Git 只读检查 |
| 统一设计基础 | 已完成 | 主题变量、尺寸、颜色、圆角和密度 | 样式静态检查、相关组件测试 |
| 登录后整体框架 | 已完成 | 顶栏、深色导航、工作区、深色状态栏 | 结构检查与聚焦测试；完整编译按用户要求延后 |
| 公共交互组件 | 已完成 | 底部任务中心、顶部消息面板、浮层与提示样式 | 聚焦测试、代码规范检查 |
| 业务页面适配 | 已完成静态实施 | 四十项映射的页面、真实内部状态与能力边界 | 路由、接口、布局与受保护范围检查 |
| 综合验证与审查 | 静态验证完成，动态验收待用户编译 | 验证报告、阶段提交、四十页证据表和十二项验收矩阵 | 聚焦测试与代码规范检查完成；渲染器编译、真实服务联调和视觉走查延后 |

## 已完成页面适配

- 工作总览：保留项目、流量、风险和最近任务的真实查询与状态分支，统一指标区、工作台面板和错误状态。
- 代理与流量：保留代理启动、双向劫持、放行、丢弃、规则、证书、历史查询、高级筛选和报文详情链路，统一控制区、表格、详情分栏与编辑区。
- 报文重放与对比：保留原请求构造、参数、页签事件、流式响应、差异编辑器和进程通信，统一工具栏、编辑器容器与结果区。
- 插件体系：保留在线与本地插件来源、详情、编辑、批量导入、执行参数和日志链路，统一目录、列表、详情、编辑器与导入容器。
- 扫描与工具：保留通用检测、专项检测、端口检测、扫描历史、字典测试、编解码与哈希方法来源，统一步骤区、参数区、任务区和结果区。
- 项目与系统：保留项目管理、导入导出、网络设置、引擎动作、客户端数据统计和诊断入口，统一页面层级和操作区域。
- 公共浮层：登录后外壳挂载期间统一下拉菜单、提示、气泡卡片、通知、消息、模态框、抽屉和加载状态，退出外壳后移除作用域。
- 任务中心：继续读取真实协作任务接口，改为从深色状态栏向上展开的工作区宽面板，并增加任务名称、说明、状态和更新时间列。
- 密令导入：保留密令验证、数据提取、页面转发与历史数据写入协议，统一表单密度和操作区。
- 报表预览：保留报表查询、删除、生成、导出与渲染协议，调整分栏表面、列表密度和选中状态。
- 报告生成：保留端口扫描与代码扫描的生成、取消、进度和报告跳转协议，统一输入区、进度区与底部操作区。
- 漏洞详情与处置：保留详情字段、代码定位、处置历史和评论数据，统一详情头、边框、标题层级和处置记录密度。
- 数据导入导出：保留进程通信流、取消监听、进度和日志数据，统一提示面板与表单间距。
- 流量规则：保留规则模型、筛选、启停、导入导出和正则编辑行为，调整抽屉、表格与规则编辑操作区。
- 快捷键设置：保留事件映射、本地存储、冲突检测与编辑弹窗，调整目录宽度、行高和按键展示。
- 网络诊断：保留基础诊断、域名解析、路由追踪、进程通信与终端输出，增加全高分栏容器和终端表面。
- 数据统计：保留用户、机构、活跃度和增长图表数据，统一卡片轮廓、间距、标题层级和小窗口高度。

## 受保护范围

- `ConfigPrivateDomain.tsx`、`ConfigPrivateDomain.scss`、`AccountAdminPage.module.scss`、`RoleAdminPage.tsx` 与 `RoleAdminPage.module.scss` 的文件对象与界面改造前基线完全一致；企业登录共享组件、组织和权限实现没有最终差异。
- `AccountAdminPage.tsx` 相对该基线只有四处新增列宽，分别用于用户名、组织、角色和创建时间。该变化来自用户后续提出“用户管理看不到用户信息”的明确反馈，不涉及字段、请求、权限、编辑、重置、复制或删除行为。
- 账号创建和密码重置继续展示服务返回的用户名与密码，并保留原复制操作；本任务不改变账号服务返回值处理。
- 主界面的密码设置弹窗与企业服务地址配置继续使用任务基线中的容器和交互；登录后公共浮层主题明确排除登录方式弹窗与企业服务地址配置。
- 企业登录、用户、角色、组织、权限、主进程、协议、数据库与生成目录没有本任务新增实现。

## 当前本地检查

- 六份聚焦测试文件共三十六项用例通过，覆盖菜单模型、顶部导航、公共原语、路由视觉映射、登录后浮层作用域和真实任务中心。
- `RenyanNavigation.test.tsx` 的五项消息联动用例通过；`RuiYanPrimitives.test.tsx` 的十二项浮层和原语用例通过。
- 报告、扫描历史、漏洞、审计漏洞、流量详情、消息中心和受保护页面的定向代码规范检查均为零错误；报告中的提示来自既有规则，不包含新增错误。
- 目标源码和样式的格式检查及差异空白检查通过。三份交付文档的格式检查通过；映射表包含连续四十项、覆盖全部四十个素材文件，十二项验收与十项交付清单数量完整。
- 没有启动开发服务、用户管理服务、引擎、渲染器编译、完整类型检查或安装包构建；动态视觉与真实服务联调由用户后续编译时验收。

## 本地实施提交

- `17780078f`：完成效果图对应次级页面的第一阶段重构。
- `daff81f15`：建立睿眼产品界面、统一应用框架与页面映射基础。
- `2055334f3`：替换旧版页面布局并形成统一界面原语。
- `c15f282e6`：恢复登录、私有域、账号、角色及密码设置的任务基线行为。
- `ba4c29e0c`：完善应用框架、导航、任务中心、消息中心、视觉变量与相关测试。
- `4ec7623cc`：统一报告、统计、诊断、规则、扫描、风险、快捷键与审计详情页面的视觉细节。
- `7d68fdb67`：记录页面映射、组件清单和静态验证状态。
- `8c6cc057f`：处理报文差异读取异常和用户表格显示问题。
- `106c57a75`：统一企业免许可客户端开发启动入口。
- `e211e769f`：统一浅色工作区主题、公共浮层与流量详情。
- `c03547d1f`：联通顶部消息未读状态、已读和清理动作。
- `9cc72c82f`：统一报告中心与扫描历史工作区。
- `e1d7a4c7b`：统一漏洞与审计漏洞详情工作区。
- `da4b3fb47`：恢复企业登录和管理页面保护边界，仅保留用户授权的四处列宽。
- 本文件所在提交：完善四十页素材映射、组件清单、十二项验收边界和十项交付说明。

上述界面提交均位于本地 `qsh` 分支，未推送远程仓库。`origin/qsh..HEAD` 的提交范围不包含主进程、协议、引擎二进制或生成目录。任务开始前已有的主进程、配置与布局差异仍在工作区中，未被本任务纳入提交。

## 实际提交文件清单

以下一百五十三个路径是当前本地提交相对 `origin/qsh` 的逐文件差异，由 `git diff --name-only origin/qsh..HEAD` 取得。列表包含阶段记录、保护范围恢复文件、测试、开发启动入口和三份交付文档；工作区中尚未提交的主进程与渲染配置差异不在此表内。

~~~text
.claude/context-summary-修复HistoryTab导出.md
.claude/context-summary-客户端调试脚本.md
.claude/context-summary-睿眼二三级页面统一风格.md
.claude/context-summary-睿眼子模块空状态统一.md
.claude/context-summary-睿眼最终验收审计.md
.claude/context-summary-睿眼登录后整体重构.md
.claude/context-summary-睿眼统一极简架构重做.md
.claude/context-summary-角色权限空闲态精简.md
.claude/context-summary-运行态界面故障修正.md
.claude/operations-log.md
.claude/verification-report.md
app/renderer/src/main/src/components/ConfigPrivateDomain/ConfigPrivateDomain.scss
app/renderer/src/main/src/components/ConfigPrivateDomain/ConfigPrivateDomain.tsx
app/renderer/src/main/src/components/HTTPFlowDetail.tsx
app/renderer/src/main/src/components/HTTPHistory.module.scss
app/renderer/src/main/src/components/HTTPHistory.tsx
app/renderer/src/main/src/components/ImportExportModal/ImportExportModal.module.scss
app/renderer/src/main/src/components/MessageCenter/MessageCenter.module.scss
app/renderer/src/main/src/components/MessageCenter/MessageCenter.tsx
app/renderer/src/main/src/components/configNetwork/ConfigNetworkPage.module.scss
app/renderer/src/main/src/components/configNetwork/ConfigNetworkPage.tsx
app/renderer/src/main/src/components/hTTPFlowDetail.module.scss
app/renderer/src/main/src/components/layout/FuncDomain.tsx
app/renderer/src/main/src/components/layout/HelpDoc/HelpDoc.tsx
app/renderer/src/main/src/components/layout/RenyanPageHeader.tsx
app/renderer/src/main/src/components/layout/RenyanStatusBar.module.scss
app/renderer/src/main/src/components/layout/RenyanStatusBar.tsx
app/renderer/src/main/src/components/layout/RenyanTaskCenter.module.scss
app/renderer/src/main/src/components/layout/RenyanTaskCenter.tsx
app/renderer/src/main/src/components/layout/UILayout.tsx
app/renderer/src/main/src/components/layout/__test__/RenyanTaskCenter.test.tsx
app/renderer/src/main/src/components/layout/funcDomain.module.scss
app/renderer/src/main/src/components/layout/uiLayout.module.scss
app/renderer/src/main/src/components/renyanUI/RuiYanPage.module.scss
app/renderer/src/main/src/components/renyanUI/RuiYanPrimitives.tsx
app/renderer/src/main/src/components/renyanUI/RuiYanShell.tsx
app/renderer/src/main/src/components/renyanUI/RuiYanUI.module.scss
app/renderer/src/main/src/components/renyanUI/RuiYanVisualContext.tsx
app/renderer/src/main/src/components/renyanUI/__test__/RuiYanPrimitives.test.tsx
app/renderer/src/main/src/components/renyanUI/__test__/RuiYanShell.test.tsx
app/renderer/src/main/src/components/renyanUI/__test__/RuiYanVisualContext.test.ts
app/renderer/src/main/src/components/renyanUI/index.ts
app/renderer/src/main/src/components/yakitUI/YakitDrawer/YakitDrawer.module.scss
app/renderer/src/main/src/components/yakitUI/YakitHint/YakitHint.module.scss
app/renderer/src/main/src/components/yakitUI/YakitHint/YakitHint.tsx
app/renderer/src/main/src/components/yakitUI/YakitModal/YakitModalConfirm.tsx
app/renderer/src/main/src/components/yakitUI/YakitModal/yakitModal.module.scss
app/renderer/src/main/src/pages/MainOperator.tsx
app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.module.scss
app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.tsx
app/renderer/src/main/src/pages/codec/NewCodec.module.scss
app/renderer/src/main/src/pages/codec/NewCodec.tsx
app/renderer/src/main/src/pages/codec/NewCodecUIStore.module.scss
app/renderer/src/main/src/pages/codec/NewCodecUIStore.tsx
app/renderer/src/main/src/pages/compare/DataCompare.module.scss
app/renderer/src/main/src/pages/compare/DataCompare.tsx
app/renderer/src/main/src/pages/dataStatistics/DataStatistics.module.scss
app/renderer/src/main/src/pages/diagnoseNetwork/DiagnoseNetworkPage.module.scss
app/renderer/src/main/src/pages/diagnoseNetwork/DiagnoseNetworkPage.tsx
app/renderer/src/main/src/pages/fuzzer/HTTPFuzzerPage.module.scss
app/renderer/src/main/src/pages/fuzzer/HTTPFuzzerPage.tsx
app/renderer/src/main/src/pages/fuzzer/WebFuzzerPage/WebFuzzerPage.module.scss
app/renderer/src/main/src/pages/fuzzer/WebFuzzerPage/WebFuzzerPage.tsx
app/renderer/src/main/src/pages/fuzzer/components/PluginDebugDrawer/PluginDebugDrawer.tsx
app/renderer/src/main/src/pages/fuzzer/components/ShareImport/index.scss
app/renderer/src/main/src/pages/fuzzer/components/ShareImport/index.tsx
app/renderer/src/main/src/pages/home/Home.tsx
app/renderer/src/main/src/pages/home/home.module.scss
app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.module.scss
app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.tsx
app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContentType.d.ts
app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx
app/renderer/src/main/src/pages/layout/renyanMenu/__test__/RenyanNavigation.test.tsx
app/renderer/src/main/src/pages/loginOperationMenu/AccountAdminPage.module.scss
app/renderer/src/main/src/pages/loginOperationMenu/AccountAdminPage.tsx
app/renderer/src/main/src/pages/loginOperationMenu/RoleAdminPage.module.scss
app/renderer/src/main/src/pages/loginOperationMenu/RoleAdminPage.tsx
app/renderer/src/main/src/pages/mitm/MITMChromeLauncher.tsx
app/renderer/src/main/src/pages/mitm/MITMPage.module.scss
app/renderer/src/main/src/pages/mitm/MITMPage.tsx
app/renderer/src/main/src/pages/mitm/MITMRule/MITMRule.module.scss
app/renderer/src/main/src/pages/mitm/MITMRule/MITMRuleFromModal.module.scss
app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMHijackedContent.tsx
app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMPluginHijackContent.tsx
app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMServerHijacking.module.scss
app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMServerHijacking.tsx
app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMAddTLS.tsx
app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMCertificateDownloadModal.tsx
app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMFiltersModal.tsx
app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMFormAdvancedConfiguration.tsx
app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMServerStartForm.module.scss
app/renderer/src/main/src/pages/pluginEditor/addYakitPlugin/AddYakitPlugin.module.scss
app/renderer/src/main/src/pages/pluginEditor/editorCode/EditorCode.module.scss
app/renderer/src/main/src/pages/pluginEditor/editorCode/EditorCode.tsx
app/renderer/src/main/src/pages/pluginEditor/editorInfo/EditorInfo.module.scss
app/renderer/src/main/src/pages/pluginEditor/editorInfo/EditorInfo.tsx
app/renderer/src/main/src/pages/pluginEditor/modifyYakitPlugin/ModifyYakitPlugin.module.scss
app/renderer/src/main/src/pages/pluginEditor/modifyYakitPlugin/ModifyYakitPlugin.tsx
app/renderer/src/main/src/pages/pluginEditor/pluginEditor/PluginEditor.module.scss
app/renderer/src/main/src/pages/pluginEditor/pluginEditor/PluginEditor.tsx
app/renderer/src/main/src/pages/pluginHub/defaultConstant.tsx
app/renderer/src/main/src/pages/pluginHub/group/PluginGroupDrawer.tsx
app/renderer/src/main/src/pages/pluginHub/hubExtraOperate/HubExtraOperate.tsx
app/renderer/src/main/src/pages/pluginHub/pluginEnvVariables/PluginEnvVariables.tsx
app/renderer/src/main/src/pages/pluginHub/pluginHub/PluginHub.module.scss
app/renderer/src/main/src/pages/pluginHub/pluginHub/PluginHub.tsx
app/renderer/src/main/src/pages/pluginHub/pluginHubDetail/PluginHubDetail.module.scss
app/renderer/src/main/src/pages/pluginHub/pluginHubDetail/PluginHubDetail.tsx
app/renderer/src/main/src/pages/pluginHub/pluginHubList/HubListLocal.tsx
app/renderer/src/main/src/pages/pluginHub/pluginHubList/PluginHubList.module.scss
app/renderer/src/main/src/pages/pluginHub/pluginHubList/PluginHubList.tsx
app/renderer/src/main/src/pages/pluginHub/pluginHubList/funcTemplate.tsx
app/renderer/src/main/src/pages/pluginHub/pluginLog/PluginLog.module.scss
app/renderer/src/main/src/pages/pluginHub/pluginLog/PluginLogList.tsx
app/renderer/src/main/src/pages/pluginHub/pluginLog/PluginLogMergeDetail.tsx
app/renderer/src/main/src/pages/pluginHub/pluginUploadModal/PluginUploadModal.module.scss
app/renderer/src/main/src/pages/pluginHub/pluginUploadModal/PluginUploadModal.tsx
app/renderer/src/main/src/pages/plugins/baseTemplate.tsx
app/renderer/src/main/src/pages/plugins/funcTemplate.tsx
app/renderer/src/main/src/pages/plugins/local/PluginLocalExportProps.tsx
app/renderer/src/main/src/pages/plugins/manage/PluginManage.tsx
app/renderer/src/main/src/pages/plugins/manage/PluginManageDetail.tsx
app/renderer/src/main/src/pages/plugins/manage/pluginManage.module.scss
app/renderer/src/main/src/pages/plugins/operator/localPluginExecuteDetailHeard/PluginExecuteExtraParams.tsx
app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/HybridScanTaskListDrawer.tsx
app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/PluginBatchExecuteExtraParams.tsx
app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/PluginBatchExecutor.module.scss
app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/pluginBatchExecutor.tsx
app/renderer/src/main/src/pages/plugins/pluginDebug/PluginDebug.tsx
app/renderer/src/main/src/pages/portscan/CreateReport.module.scss
app/renderer/src/main/src/pages/portscan/CreateReport.tsx
app/renderer/src/main/src/pages/risks/YakitRiskTable/YakitRiskTable.module.scss
app/renderer/src/main/src/pages/risks/YakitRiskTable/YakitRiskTable.tsx
app/renderer/src/main/src/pages/securityTool/newBrute/BruteExecuteParamsDrawer.tsx
app/renderer/src/main/src/pages/securityTool/newBrute/NewBrute.module.scss
app/renderer/src/main/src/pages/securityTool/newBrute/NewBrute.tsx
app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.module.scss
app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx
app/renderer/src/main/src/pages/shortcutKey/ShortcutKey.module.scss
app/renderer/src/main/src/pages/softwareSettings/ProjectManage.module.scss
app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx
app/renderer/src/main/src/pages/yakRunnerAuditHole/YakitAuditHoleTable/YakitAuditHoleTable.module.scss
app/renderer/src/main/src/pages/yakRunnerAuditHole/YakitAuditHoleTable/YakitAuditHoleTable.tsx
app/renderer/src/main/src/pages/yakRunnerScanHistory/YakRunnerScanHistory.module.scss
app/renderer/src/main/src/pages/yakRunnerScanHistory/YakRunnerScanHistory.tsx
app/renderer/src/main/src/routes/__test__/renyanMenu.test.ts
app/renderer/src/main/src/routes/renyanMenu.ts
app/renderer/src/main/src/theme/renyan.scss
docs/ui-redesign/ui-component-inventory.md
docs/ui-redesign/ui-implementation-status.md
docs/ui-redesign/ui-page-mapping.md
start-client-dev.cmd
start-enterprise-no-license-dev.cmd
~~~

## 能力边界

- 编号二十七没有独立通知规则提交协议，不创建静态规则页或不可执行的保存按钮。
- 编号三十一只在现有分享模块支持的语义内工作，不构造项目级密令协议。
- 编号三十九没有独立操作审计日志接口，不使用代码审计漏洞数据冒充系统审计记录。
- 编号三十保留真实网络诊断与终端输出，不把少量缓存或前端日志伪装为完整系统日志库。

## 已识别风险

- 报告、通知规则、系统日志、审计日志和项目级密令分享的能力边界不同，禁止用静态内容掩盖缺失接口。
- 旧页面仍混用第三方组件与既有公共组件，适合通过主题作用域适配，避免逐页复制样式。
- 大型编辑器、表格和分栏依赖精确高度计算，状态栏与向上展开面板必须保留内容占位。
- 报告工具栏在窄窗口下的横向滚动、风险页按视口估算的首批读取量，以及系统设置在真实缩放比例下的滚动边界仍需动态查看。
- 用户管理四处列宽属于后续反馈授权的例外；若以最初目标中“相关源码零差异”的字面标准判断，该项只能记为条件满足。

## 最终十二项静态验收

| 编号 | 验收条件 | 当前判定 | 证据与待办 |
| --- | --- | --- | --- |
| 1 | 企业登录界面保持原样 | 静态通过 | 登录共享组件和私有域配置已恢复到界面改造前基线；登录后主题只在 `RuiYanAppShell` 挂载期间生效 |
| 2 | 用户管理相关内容未被修改 | 条件满足 | 角色、组织、权限和用户管理样式回到基线；`AccountAdminPage.tsx` 仅有用户后续授权的四处列宽，严格按零差异标准仍属于例外 |
| 3 | 后端、引擎和远程过程调用未被修改 | 提交范围静态通过 | `origin/qsh..HEAD` 不含主进程、协议、引擎二进制或生成目录；工作区另有任务开始前遗留差异，未纳入本任务 |
| 4 | 登录后整体框架明显区别于原产品 | 静态结构通过，动态待验 | 新顶栏、两级深色导航、浅色工作区和全宽状态栏已统一挂载；视觉差异需用户编译后确认 |
| 5 | 左侧菜单、顶部栏和底部栏形成统一结构 | 静态通过 | `RuiYanAppShell`、`RuiYanTopCommandBar`、`RuiYanPrimaryNav`、`RuiYanSecondaryNav`、`RenyanStatusBar` |
| 6 | 二三级页面结构明显改变 | 静态结构通过，动态待验 | 流量、报告、扫描、漏洞和审计页已有标题、工具栏、分栏及详情面板；缩放与溢出需实际窗口确认 |
| 7 | 移除原产品右下角悬浮入口 | 静态通过 | 公共入口迁移至底部状态栏和顶部工具栏，任务中心从底部向上展开 |
| 8 | 弹窗、抽屉和消息面板使用统一样式 | 静态通过 | 登录后主题作用域覆盖新原语、既有模态、既有抽屉、下拉、提示、通知和消息面板 |
| 9 | 流量、扫描、插件、协同、报告和工具功能仍可用 | 动态待验 | 静态调用链和参数保持原状；由于用户要求暂不编译和启动服务，尚无真实服务端到端证据 |
| 10 | 全部效果图页面建立实现映射 | 静态通过 | `ui-page-mapping.md` 逐项记录四十个目标页面、四十个素材文件、附件、入口、源文件和证据状态；页面二十七、三十九为明确能力缺口 |
| 11 | 页面不是静态占位 | 部分静态通过，动态待验 | 代表性页面均调用真实接口；页面二十七、三十九没有产品页，页面三十一只使用现有模块分享语义 |
| 12 | 未执行安装包构建 | 通过 | 本阶段没有执行打包、编译或服务启动 |

## 完成后交付清单

1. 效果图编号与实际页面映射：见 `docs/ui-redesign/ui-page-mapping.md` 的四十项证据表。
2. 修改文件清单：见本文件“实际提交文件清单”，包含当前本地提交相对 `origin/qsh` 的一百五十三个具体路径。
3. 新增公共组件清单：见 `docs/ui-redesign/ui-component-inventory.md` 的“新增公共组件”。
4. 新增设计变量清单：见 `docs/ui-redesign/ui-component-inventory.md` 的“设计变量”。
5. 原有接口和远程过程调用保留说明：见 `docs/ui-redesign/ui-component-inventory.md` 的“真实数据与协议边界”。
6. 企业登录与管理页面说明：企业登录、私有域、角色、组织和权限回到基线；用户管理只有四处获授权列宽，相关业务行为未改。
7. 各阶段提交记录：见本文件“本地实施提交”；提交均位于 `qsh`，尚未推送。
8. 本地启动与验收步骤：用户完成依赖与渲染器准备后，从仓库根目录运行 `.\start-enterprise-no-license-dev.cmd`；若只需要客户端热更新入口，运行 `.\start-client-dev.cmd`。随后检查登录、用户信息、系统设置滚动、报文差异、流量详情、任务中心、消息面板、报告、扫描、漏洞和窗口缩放。
9. 尚未解决的问题：真实窗口视觉、服务端端到端能力、页面二十七与三十九的协议缺口、页面三十一的语义限制，以及页面三十不是完整系统日志库。
10. 建议推送命令：动态验收通过后执行 `git push origin qsh`。本任务不会自行推送。
