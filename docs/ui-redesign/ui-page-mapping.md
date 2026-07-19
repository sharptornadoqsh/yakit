# 睿眼登录后界面页面映射

## 范围与判定规则

本映射覆盖指定效果图目录中的全部四十个图片文件。目录内有三组内容重复的图片，分别对应附件编号十七与十八、二十一与二十二、三十五与三十六；重复文件仍保留清点记录，但共享同一实现映射。

页面名称、字段和操作以当前仓库的真实路由、组件、进程间通信、远程过程调用及网络接口为准。效果图仅用于确定结构、层级、密度和视觉表现。没有现成协议支持的通知规则、系统日志、审计日志和项目级密令分享不得使用模拟数据或虚构提交行为。

## 页面映射

| 编号 | 效果图页面 | 现有路由或入口 | 主要组件 | 实施方式 |
| --- | --- | --- | --- | --- |
| 01 | 工作总览 | `YakitRoute.NewHome` | `pages/home/Home.tsx` | 保留真实指标查询，统一工作台面板与状态样式 |
| 02 | HTTP/HTTPS 代理拦截 | `YakitRoute.MITMHacker` | `MITMPage` 及劫持子组件 | 保留 V2 代理、劫持、放行和丢弃协议 |
| 03 | HTTP 历史流量 | `YakitRoute.DB_HTTPHistory` | `HTTPHistory`、`HTTPFlowTable` | 统一查询区、表格和详情分栏 |
| 04 | 高级筛选抽屉 | 历史流量内部状态 | `HTTPFlowTable` 筛选组件 | 使用统一抽屉，不新增主路由 |
| 05 | 请求响应报文详情 | 历史流量选中态 | `HTTPFlowDetail`、`HTTPFlowDetailMini` | 保留真实报文加载与编辑器 |
| 06 | 报文修改与重放 | `YakitRoute.HTTPFuzzer` | `WebFuzzerPage`、`HTTPFuzzerPage` | 保留页签事件、参数和调用链 |
| 07 | 报文差异对比 | `YakitRoute.DataCompare` | `DataCompare` | 保留差异编辑器和进程间通信 |
| 08 | 插件仓库 | `YakitRoute.Plugin_Hub` | `PluginHub` | 统一目录、筛选与列表层级 |
| 09 | 插件详情弹窗 | 插件仓库内部状态 | `PluginHubDetail` | 使用统一详情抽屉，不新增主路由 |
| 10 | 项目协同 | 壳层与既有管理入口 | `ProjectManage` 及协同组件 | 只组合真实项目和团队能力，不改用户管理实现 |
| 11 | 密令导入 | 功能内入口 | `pages/fuzzer/components/ShareImport` | 保留 `module/extract/pwd` 与 `module/extract` |
| 12 | 通用扫描 | `YakitRoute.BatchExecutorPage` | `PluginBatchExecutor` | 保留插件选择、目标与任务协议 |
| 13 | 扫描向导 | 通用扫描内部步骤 | `HybridScanExecuteContent` | 使用现有步骤状态，不新增主路由 |
| 14 | 扫描结果 | `YakitRoute.YakRunner_ScanHistory` | `YakRunnerScanHistory` | 统一表格与详情分栏 |
| 15 | 专项扫描 | `YakitRoute.PoC` | `YakPoC` | 保留专项插件与调用路径 |
| 16 | 报告中心 | `YakitRoute.DB_Report` | `ReportViewerPage` | 纳入统一页面视觉作用域 |
| 17 | 报告预览 | 报告中心选中态 | `ReportViewer` | 保留 `reportId` 驱动的预览区 |
| 18 | 字典测试 | `YakitRoute.Mod_Brute` | `NewBrute` | 保留 `StartBrute` 流式协议 |
| 19 | 编解码工具 | `YakitRoute.Codec` | `NewCodec` | 方法列表继续由引擎返回 |
| 20 | 引擎设置 | 壳层动作 | `UILayout` 的连接、状态和更新入口 | 保留现有事件与引擎接口 |
| 21 | 底部任务中心 | 全局状态栏入口 | `apiFetchQueryAllTask` 与任务表格 | 从底部向上展开，不构造任务数据 |
| 22 | 消息面板 | `openAllMessageNotification` | `MessageCenter`、`MessageCenterModal` | 改为顶部右侧面板，保留分页、已读和刷新 |
| 23 | 通用确认弹窗 | 命令式公共入口 | `RuiYanModal`、`showRuiYanModal`、`YakitModalConfirm` | 统一标题栏、正文和固定操作区 |
| 24 | 漏洞三级详情 | 风险页面选中态 | `YakitRiskDetails`、`YakitAuditRiskDetails` | 使用详情抽屉或固定详情区 |
| 25 | 组件规范板 | 非业务路由 | `components/renyanUI` | 作为组件验收清单，不创建生产菜单 |
| 26 | 系统全局设置 | `YakitRoute.Beta_ConfigNetwork` | `ConfigNetworkPage` | 保留全部真实字段与保存函数 |
| 27 | 通知规则配置 | 无独立协议 | 未发现可确认的现成提交接口 | 只有真实能力存在时才启用 |
| 28 | 系统与版本信息 | 壳层 `openAbout` | 关于与引擎版本状态 | 使用统一弹窗，不新增主路由 |
| 29 | 数据导入导出 | 项目管理内部入口 | `ImportExportModal`、`TransferProject` | 保留流式事件和项目进程间通信 |
| 30 | 系统日志查看 | `YakitRoute.Beta_DiagnoseNetwork` | `DiagnoseNetworkPage` | 不把少量缓存伪装为完整日志库 |
| 31 | 项目密令分享 | 受协议能力约束 | `ShareModal`、`ShareImportExportData` | 仅复用服务端明确支持的模块语义 |
| 32 | 流量规则管理 | 代理页面内部入口 | `MITMRule` | 保留规则模型与导入导出 |
| 33 | HTTPS 证书管理 | 设置与代理内部入口 | `ClientCertificates`、`MITMAddTLS` | 保留字节转换与格式校验 |
| 34 | 插件批量导入向导 | 插件中心内部入口 | `ImportLocalPlugin` | 保留四类来源及流式取消协议 |
| 35 | 扫描策略配置 | 扫描任务内部入口 | `HybridScanExecuteContent` 与参数抽屉 | 保留并发、超时、代理、插件和目标参数 |
| 36 | 漏洞处置工作台 | `YakitRoute.YakRunner_Audit_Hole` | `YakitAuditRiskDetails` | 纳入统一风险详情视觉作用域 |
| 37 | 报告生成配置 | 扫描或风险内部入口 | `CreateReportContent` | 保留现有报告生成调用并打开报告中心 |
| 38 | 哈希摘要工具 | `YakitRoute.Codec` | `NewCodec` 的引擎方法集合 | 不另设重复路由 |
| 39 | 审计日志 | 无独立协议 | 未发现操作审计日志接口 | 不以代码审计漏洞页替代操作审计日志 |
| 40 | 快捷键帮助与关于系统 | `YakitRoute.ShortcutKey` 与 `openAbout` | `ShortcutKeyList`、关于弹窗 | 两个真实入口共享统一视觉规范 |

## 素材证据

- 图片总数：四十。
- 唯一画面：三十七。
- 附件编号七至十六分别对应页面二十一至三十，原始分辨率为 `3840 × 2160`。
- 其余附件分辨率为 `1672 × 941`。
- 原始素材文件与附件已通过文件摘要逐一对应。

## 受保护边界

本次新增提交不得修改企业版登录、用户管理、角色管理、组织管理和用户权限管理页面，也不得修改引擎、协议、后端、数据库及生成目录。任务开始前已经存在的未提交改动保持原状，不纳入本任务提交。
