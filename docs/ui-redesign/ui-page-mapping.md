# 睿眼登录后界面页面映射

## 范围与判定规则

本映射覆盖指定效果图目录中的全部四十个图片文件。文件摘要显示共有三十七个唯一画面；附件十七与十八、附件二十一与二十二、附件三十五与三十六分别是三组完全重复的素材。重复文件保留独立清点记录，但共享同一页面映射。目标清单中的页面三十一至三十三没有独立效果图，其依据为任务目标中的补充页面要求。

页面名称、字段和操作以当前仓库的真实路由、组件、进程间通信、远程过程调用及网络接口为准。效果图仅用于确定结构、层级、密度和视觉表现。没有现成协议支持的通知规则、系统日志、审计日志和项目级密令分享不得使用模拟数据或虚构提交行为。

## 页面映射

| 编号 | 效果图页面 | 原始素材与附件 | 真实路由或入口 | 主要源文件 | 实施与证据状态 |
| --- | --- | --- | --- | --- | --- |
| 01 | 工作总览 | `70bd2b76-e60c-4cab-86f4-0070f1e5c1c2.png`；附件 20 | `YakitRoute.NewHome` | `app/renderer/src/main/src/pages/home/Home.tsx` | 静态实施完成；保留真实项目、流量和风险查询，动态效果待用户编译验收 |
| 02 | HTTP/HTTPS 代理拦截 | `efc709e9-9a20-4b05-91a8-9dad6c2da4a2.png`；附件 39 | `YakitRoute.MITMHacker` | `app/renderer/src/main/src/pages/mitm/MITMPage.tsx`；`app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMServerHijacking.tsx` | 静态实施完成；V2 代理、劫持、放行和丢弃调用保持原状 |
| 03 | HTTP 历史流量 | `94b34f2f-c64a-4da4-a6d9-083ccac564e3.png`；附件 23 | `YakitRoute.DB_HTTPHistory` | `app/renderer/src/main/src/components/HTTPHistory.tsx`；`app/renderer/src/main/src/components/HTTPFlowTable/HTTPFlowTable.tsx` | 静态实施完成；查询、分页、表格和选中详情均使用真实数据 |
| 04 | 高级筛选抽屉 | `a9714ecf-20d5-4142-803d-a65ef8d8486c.png`；附件 30 | 历史流量内部状态 | `app/renderer/src/main/src/components/HTTPFlowTable/HTTPFlowTable.tsx`；`app/renderer/src/main/src/components/HTTPFlowTable/components/advancedSet.tsx` | 真实内部能力映射；使用统一抽屉，不增加独立路由 |
| 05 | 请求响应报文详情 | `7e6dfb1d-f07c-4f24-9c40-bf806fff3878.png`；附件 5 | 历史流量选中态 | `app/renderer/src/main/src/components/HTTPFlowDetail.tsx`；`app/renderer/src/main/src/components/hTTPFlowDetail.module.scss` | 静态实施完成；继续调用 `GetHTTPFlowById` 并保留真实编辑器 |
| 06 | 报文修改与重放 | `64bbc3c2-3bb9-4803-bb36-2756eecd6efd.png`；附件 19 | `YakitRoute.HTTPFuzzer` | `app/renderer/src/main/src/pages/fuzzer/WebFuzzerPage/WebFuzzerPage.tsx`；`app/renderer/src/main/src/pages/fuzzer/HTTPFuzzerPage.tsx` | 静态实施完成；页签事件、参数和流式调用链未替换 |
| 07 | 报文差异对比 | `7910865c-b7fb-4ed8-9a7f-640efe6af131.png`；附件 29 | `YakitRoute.DataCompare` | `app/renderer/src/main/src/pages/compare/DataCompare.tsx` | 静态实施完成；空对象生命周期错误已处理，差异编辑器与进程通信保留 |
| 08 | 插件仓库 | `b4e9ae4f-bb54-42c2-9bfd-cd682c277cf9.png`；附件 32 | `YakitRoute.Plugin_Hub` | `app/renderer/src/main/src/pages/pluginHub/pluginHub/PluginHub.tsx`；`app/renderer/src/main/src/pages/pluginHub/pluginHubList/PluginHubList.tsx` | 静态实施完成；在线与本地插件数据来源保持原状 |
| 09 | 插件详情弹窗 | `947c8eac-be82-4fa5-a316-118c5975eadd.png`；附件 27 | 插件仓库内部状态 | `app/renderer/src/main/src/pages/pluginHub/pluginHubDetail/PluginHubDetail.tsx` | 真实内部能力映射；统一详情浮层，不增加主路由 |
| 10 | 项目协同 | `e130e11d-ac1b-435f-a348-d3bf21e012f3.png`；附件 38 | 系统设置中的项目管理及壳层团队状态 | `app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx`；`app/renderer/src/main/src/components/renyanUI/RuiYanShell.tsx` | 部分静态证据；保留真实项目管理、导入导出和团队状态，未构造效果图中仓库没有协议的协同字段 |
| 11 | 密令导入 | `4df69189-b4d3-486e-b168-d2b1181abd55.png`；附件 4 | 功能内部入口 | `app/renderer/src/main/src/pages/fuzzer/components/ShareImport/index.tsx` | 真实内部能力映射；保留 `module/extract/pwd` 与 `module/extract` |
| 12 | 通用扫描 | `dd0a1358-e66e-48e1-bcbb-cf4b2df23292.png`；附件 37 | `YakitRoute.BatchExecutorPage` | `app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/pluginBatchExecutor.tsx` | 静态实施完成；插件、目标、任务创建和流式状态使用现有协议 |
| 13 | 扫描向导 | `f7596ced-c2a7-49e6-8c5a-a370c8735059.png`；附件 40 | 通用扫描内部步骤 | `app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/pluginBatchExecutor.tsx` 中的 `HybridScanExecuteContent` | 真实内部能力映射；沿用现有步骤与参数状态 |
| 14 | 扫描结果 | `ace6671c-39cb-4a05-b130-b8d305cfa1b2.png`；附件 31 | `YakitRoute.YakRunner_ScanHistory` | `app/renderer/src/main/src/pages/yakRunnerScanHistory/YakRunnerScanHistory.tsx` | 静态实施完成；任务查询、列表和详情分栏保留 |
| 15 | 专项扫描 | `216c2b83-5704-48df-a8d4-ed60d7929e10.png`；附件 24 | `YakitRoute.PoC` | `app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx` | 静态实施完成；专项插件选择与执行路径未改 |
| 16 | 报告中心 | `0783f241-c152-4a12-87f2-42fac2876514.png`；附件 26 | `YakitRoute.DB_Report` | `app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.tsx` | 静态实施完成；`QueryReports`、删除和导出调用保留 |
| 17 | 报告预览 | `3eadbce8-789b-4296-aedd-4f69f8f80025.png`；附件 2 | 报告中心选中态 | `app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.tsx` | 真实内部能力映射；继续由 `reportId` 与 `QueryReport` 驱动预览 |
| 18 | 字典测试 | `15f304cc-a1c4-4b89-8980-98bdebf0ac1d.png`；附件 6 | `YakitRoute.Mod_Brute` | `app/renderer/src/main/src/pages/securityTool/newBrute/NewBrute.tsx` | 静态实施完成；`apiStartBrute` 流式任务协议保留 |
| 19 | 编解码工具 | `564f6ee2-1695-4597-934e-68c977ce592d.png`；附件 25 | `YakitRoute.Codec` | `app/renderer/src/main/src/pages/codec/NewCodec.tsx`；`app/renderer/src/main/src/pages/codec/NewCodecUIStore.tsx` | 静态实施完成；方法列表继续由引擎查询返回 |
| 20 | 引擎设置 | `0aeb854b-84c2-43a1-957f-f7dc9841c28b.png`；附件 1 | 壳层引擎状态与设置动作 | `app/renderer/src/main/src/components/layout/UILayout.tsx`；`app/renderer/src/main/src/components/layout/RenyanStatusBar.tsx` | 真实入口映射；连接、状态、版本和更新事件保持原状 |
| 21 | 底部任务中心 | `21_底部任务中心_4K.png`；附件 7 | 全局底部状态栏 | `app/renderer/src/main/src/components/layout/RenyanTaskCenter.tsx` | 静态实施完成；从底部向上展开并读取 `apiFetchQueryAllTask` |
| 22 | 消息面板 | `22_消息面板_4K.png`；附件 8 | 顶部消息入口与 `openAllMessageNotification` | `app/renderer/src/main/src/components/MessageCenter/MessageCenter.tsx`；`app/renderer/src/main/src/components/renyanUI/RuiYanShell.tsx` | 静态实施完成；未读数、套接字刷新、单条及全部已读已联通 |
| 23 | 通用确认弹窗 | `23_确认弹窗_4K.png`；附件 9 | 命令式公共入口 | `app/renderer/src/main/src/components/renyanUI/RuiYanPrimitives.tsx`；`app/renderer/src/main/src/components/yakitUI/YakitModal/YakitModalConfirm.tsx` | 静态实施完成；统一标题、正文、遮罩和操作区 |
| 24 | 漏洞三级详情 | `24_漏洞三级详情_4K.png`；附件 10 | 风险页选中态 | `app/renderer/src/main/src/pages/risks/YakitRiskTable/YakitRiskTable.tsx` | 静态实施完成；详情字段与真实处置数据保留 |
| 25 | 组件规范板 | `25_组件规范板_4K.png`；附件 11 | 非业务路由 | `app/renderer/src/main/src/components/renyanUI/RuiYanPrimitives.tsx`；`app/renderer/src/main/src/theme/renyan.scss` | 公共组件规范已实现；不创建面向用户的占位菜单 |
| 26 | 系统全局设置 | `26_系统全局设置_4K.png`；附件 12 | `YakitRoute.Beta_ConfigNetwork` | `app/renderer/src/main/src/components/configNetwork/ConfigNetworkPage.tsx`；`app/renderer/src/main/src/components/configNetwork/ConfigNetworkPage.module.scss` | 静态实施完成；表单恢复文档流，修正固定定位造成的区域重叠 |
| 27 | 通知规则配置 | `27_通知规则配置_4K.png`；附件 13 | 仓库中无独立产品协议或路由 | 无可确认的产品源文件 | 能力缺口；未实现产品页，不构造模拟规则、静态保存或虚构接口 |
| 28 | 系统与版本信息 | `28_系统与版本信息_4K.png`；附件 14 | 壳层 `openAbout` 动作 | `app/renderer/src/main/src/routes/renyanMenu.ts`；`app/renderer/src/main/src/components/layout/HelpDoc/HelpDoc.tsx` | 真实入口映射；使用当前版本和引擎状态，不写入效果图中的虚构版本 |
| 29 | 数据导入导出 | `29_数据导入导出_4K.png`；附件 15 | 项目管理内部入口 | `app/renderer/src/main/src/components/ImportExportModal/ImportExportModal.tsx`；`app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx` | 静态实施完成；项目进程通信、流式进度和取消监听保留 |
| 30 | 系统日志查看 | `30_系统日志查看_4K.png`；附件 16 | `YakitRoute.Beta_DiagnoseNetwork` | `app/renderer/src/main/src/pages/diagnoseNetwork/DiagnoseNetworkPage.tsx` | 部分能力映射；提供真实网络诊断、域名解析、路由追踪和终端输出，不宣称为完整系统日志库 |
| 31 | 项目密令分享 | 无独立素材；无附件 | 现有模块分享与导入入口 | `app/renderer/src/main/src/pages/fuzzer/components/ShareImportExportData/index.tsx`；`app/renderer/src/main/src/pages/fuzzer/components/ShareImport/index.tsx` | 受限能力映射；仅复用服务端已支持的模块分享语义，不构造项目级密令协议 |
| 32 | 流量规则管理 | 无独立素材；无附件 | 代理页面内部入口 | `app/renderer/src/main/src/pages/mitm/MITMRule/MITMRule.tsx`；`app/renderer/src/main/src/pages/mitm/MITMRule/MITMRuleConfigure/MITMRuleConfigure.tsx` | 真实内部能力映射；规则模型、筛选、启停与导入导出保留 |
| 33 | HTTPS 证书管理 | 无独立素材；无附件 | 网络设置与代理内部入口 | `app/renderer/src/main/src/components/configNetwork/ConfigNetworkPage.tsx`；`app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMAddTLS.tsx` | 真实内部能力映射；证书字节转换、容器格式与校验保留 |
| 34 | 插件批量导入向导 | `8588eb9e-e6f6-4527-b423-6e209349fa35.png`；附件 28 | 插件中心和代理插件内部入口 | `app/renderer/src/main/src/pages/mitm/MITMPage.tsx` 中的 `ImportLocalPlugin`；`app/renderer/src/main/src/pages/layout/publicMenu/ExtraMenu.tsx` | 真实内部能力映射；本地导入、流式状态与取消协议保留 |
| 35 | 扫描策略配置 | `40e42141-3d02-4604-85b7-566b02639d73.png`、`40e42141-3d02-4604-85b7-566b02639d73 (1).png`；附件 17、18，内容重复 | 扫描任务内部入口 | `app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/pluginBatchExecutor.tsx`；`app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/PluginBatchExecuteExtraParams.tsx` | 真实内部能力映射；并发、超时、代理、插件和目标参数保留 |
| 36 | 漏洞处置工作台 | `4b5d1d00-3782-42cf-adf4-6c2316996db5.png`；附件 3 | `YakitRoute.YakRunner_Audit_Hole` | `app/renderer/src/main/src/pages/yakRunnerAuditHole/YakitAuditHoleTable/YakitAuditHoleTable.tsx` | 静态实施完成；漏洞列表、详情、评论和处置状态均使用真实数据 |
| 37 | 报告生成配置 | `b4217fb0-1a82-44b8-82e4-5e215847d08f.png`；附件 33 | 扫描或风险内部入口 | `app/renderer/src/main/src/pages/portscan/CreateReport.tsx` | 静态实施完成；报告生成、取消、进度和报告中心跳转调用保留 |
| 38 | 哈希摘要工具 | `94aa3b94-da19-4be8-b5f8-9a73e4903996.png`、`94aa3b94-da19-4be8-b5f8-9a73e4903996 (1).png`；附件 21、22，内容重复 | `YakitRoute.Codec` | `app/renderer/src/main/src/pages/codec/NewCodec.tsx` | 真实能力复用；使用引擎返回的哈希方法，不增加重复路由 |
| 39 | 审计日志 | `c908e728-cccb-45b8-92e0-02e1c2bf4895.png`；附件 34 | 仓库中无独立操作审计协议或路由 | 无可确认的产品源文件 | 能力缺口；未实现产品页，不以代码审计漏洞数据冒充操作审计日志 |
| 40 | 快捷键帮助与关于系统 | `d91414e8-7b46-4c75-963e-1f8b08270b23.png`、`d91414e8-7b46-4c75-963e-1f8b08270b23 (1).png`；附件 35、36，内容重复 | `YakitRoute.ShortcutKey` 与壳层 `openAbout` | `app/renderer/src/main/src/pages/shortcutKey/ShortcutKey.tsx`；`app/renderer/src/main/src/routes/renyanMenu.ts` | 静态实施完成；快捷键映射、冲突检测、持久化和关于入口保留 |

## 素材证据

- 图片总数：四十；唯一画面：三十七；目标页面编号：四十。
- 重复组一：`40e42141-3d02-4604-85b7-566b02639d73.png` 与同名 `(1)` 文件，对应附件十七、十八和页面三十五。
- 重复组二：`94aa3b94-da19-4be8-b5f8-9a73e4903996.png` 与同名 `(1)` 文件，对应附件二十一、二十二和页面三十八。
- 重复组三：`d91414e8-7b46-4c75-963e-1f8b08270b23.png` 与同名 `(1)` 文件，对应附件三十五、三十六和页面四十。
- 附件七至十六分别对应页面二十一至三十，原始分辨率为 `3840 × 2160`；其余附件分辨率为 `1672 × 941`。
- 页面三十一至三十三没有独立素材文件或附件，属于目标清单要求，不计入四十个素材文件。
- 原始素材与附件已通过文件摘要逐一对应；页面映射以画面内容为准，不以随机文件名顺序推断。

## 受保护边界

企业版登录、角色管理、组织管理、用户权限管理页面以及私有域配置已恢复到界面改造前基线。用户管理页仅保留用户在后续反馈中授权的四处表格列宽调整，用于显示真实用户名、组织、角色和创建时间；账号字段、服务调用、编辑、重置、复制与删除行为均未改变。引擎、协议、后端、数据库和生成目录不属于本次界面提交范围。任务开始前已经存在的未提交改动保持原状，不纳入本任务提交。
