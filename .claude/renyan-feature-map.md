# 睿眼需求功能映射

生成时间：2026-07-16 21:50:04 +08:00

本表以 `功能要求.xls` 为冻结基线，记录现有真实页面与调用。目标位置表示新信息架构中的入口；“隐藏”只影响前端入口，不删除底层实现。

| 序号 | 功能与星标 | 当前路由和页面 | 主要组件 | 当前操作与处理函数 | API、IPC 或 gRPC | 重构位置 | 策略 |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 流量拦截、证书与 HTTPS，星标 | `MITMHacker`，`MITMPage` | `MITMServerStartForm`、`MITMCertificateDownloadModal` | 启动代理、下载证书、保存代理配置 | `DownloadMITMCert`、MITM 启动调用 | 交互代理／证书与代理设置 | 保留 |
| 2 | 请求与响应双向拦截，星标 | `MITMHacker`，`MITMPage` | `MITMHijackedContent` | 请求拦截、响应拦截、继续 | 请求与响应转发 gRPC | 交互代理／劫持会话 | 保留 |
| 3 | 自动放行、手动劫持、丢弃，星标 | `MITMHacker`，`MITMPage` | `MITMHijackedContent`、`MITMManual` | 模式切换、`dropRequest`、`dropResponse` | `grpcMITMAutoForward` | 交互代理／代理控制台 | 保留 |
| 4 | 地址、主机、请求头规则，星标 | `MITMHacker`，`MITMPage` | `MITMFilters`、`MITMFiltersModal` | 新增、编辑、启用、同步规则 | 条件劫持与过滤器 gRPC | 交互代理／拦截规则 | 保留 |
| 5 | 修改报文后转发，星标 | `MITMHacker`，`MITMPage` | `MITMHijackedContent` | 修改后继续 | `grpcMITMForwardModifiedRequest`、`grpcMITMForwardModifiedResponse` | 交互代理／劫持会话 | 保留 |
| 6 | 任意请求重复发送，星标 | `DB_HTTPHistory`、`HTTPFuzzer` | `HTTPHistory`、`useHTTPFlowTableContextMenu` | 发送到重放、再次发送 | `menuOpenPage` 与原重放调用 | 流量中心／历史流量；报文工具／报文重放 | 保留 |
| 7 | 历史请求与响应 | `DB_HTTPHistory`，`HTTPHistory` | `HTTPFlowTable`、流量详情 | 查询、刷新、展开详情 | `QueryHTTPFlows` | 流量中心／历史流量 | 保留 |
| 8 | 关键字、正则、状态码和主机筛选 | `DB_HTTPHistory`，`HTTPHistory` | `HTTPFlowRuleDataFilter`、`HTTPFlowTable` | 应用筛选、清除条件 | `QueryHTTPFlows` | 流量中心／流量筛选 | 保留 |
| 9 | 通用漏洞检测与批量扫描 | `BatchExecutorPage`，`pluginBatchExecutor` | `PacketScanner`、`HybridScanTaskListDrawer` | 开始、暂停、继续、停止、查看结果 | 混合扫描 gRPC 流 | 漏洞检测／通用检测 | 保留 |
| 10 | 专项漏洞检测与批量扫描 | `PoC`，`YakPoC` | `PluginGroupByKeyWord`、`PluginGroupGrid`、`YakPoCExecuteContent` | 选择分类、配置目标、开始与恢复任务 | 混合扫描任务接口 | 漏洞检测／专项检测 | 保留 |
| 11 | 漏洞报告导出 | `DB_Report`，`ReportViewerPage` | 报告查看与导出组件 | Word、PDF、HTML 导出 | 主进程资产处理接口 | 漏洞检测／风险结果 | 隐藏入口，保留实现 |
| 12 | 高并发爆破与字典 | `Mod_Brute`，`NewBrute` | `BruteTypeTreeList`、`BruteExecute` | 开始、取消、选择字典、设置并发 | `apiStartBrute`、`apiCancelStartBrute` | 爆破测试／爆破任务 | 保留 |
| 13 | 文本与字节差异 | `DataCompare`，`DataCompare` | `CodeComparison` | 上一处、下一处、交换、清空、换行 | 编辑器实例与本地状态 | 报文工具／报文差异 | 保留；字节模式不得虚标 |
| 14 | 主流编解码 | `Codec`，`NewCodec` | 方法列表、处理链、输入输出区 | 编码、解码、复制、清空、收藏 | `GetAllCodecMethods` 与编解码调用 | 报文工具／编解码 | 保留 |
| 15 | 国密、AES 与 RSA | `Codec`，`NewCodec` | 动态算法方法与参数区 | 选择算法、执行、复制结果 | 引擎动态方法 | 报文工具／编解码；系统设置／安全设置 | 保留能力，独立高级入口隐藏 |
| 16 | 插件编写、调试和日志 | `AddYakitScript`，`PluginEditor` | 编辑器、参数、预览、日志 | 保存、同步、执行、调试、停止 | YakScript、IPC 与执行流 | 插件中心／插件开发 | 保留 |
| 17 | 插件链路可视化 | `Plugin_Hub`，无完整链路页面 | 现有插件执行器 | 现状没有完整链路编辑操作 | 未发现完整输入输出链契约 | 插件中心／插件配置 | 隐藏入口，不删除底层 |
| 18 | 插件仓库管理与批量导入 | `Plugin_Hub`，`PluginHub` | `PluginHubList`、`PluginUploadModal` | 查询、新增、修改、删除、分组、批量导入 | 本地与在线插件接口 | 插件中心／插件仓库与已安装插件 | 保留 |
| 19 | 多人协作与结果共享，星标 | 服务连接动作、项目管理 | `ConfigPrivateDomain`、`ProjectManage` | 连接服务、切换项目、上传数据 | 外部服务 HTTP 与上传 RPC | 团队协作／服务连接 | 保留真实入口，外部能力标明边界 |
| 20 | 自定义角色权限，星标 | `RoleAdminPage` | 角色列表、角色表单、权限明细 | 新建、编辑、删除、保存权限 | `/api/roles`、`/api/roles/detail` | 团队协作／角色权限 | 保留 |
| 21 | 项目增删改查 | 项目管理动作，`ProjectManage` | 项目树、项目列表、详情 | 新建、编辑、删除、查看、切换 | `GetProjects`、`NewProject`、`UpdateProject`、`DeleteProject` | 项目与安全／项目管理 | 保留 |
| 22 | 项目导入导出与加密 | 项目管理动作，`ProjectManage` | 导入、导出和密码表单 | 普通或加密导入导出、取消 | `ImportProject`、`ExportProject` | 项目与安全／项目导入导出 | 保留 |
| 23 | 本地项目安全概览 | `DB_Risk`、`DB_HTTPHistory` | `RiskPage`、`HTTPHistory` | 风险筛选、查看证据、查看历史流量 | 风险与流量查询 | 项目与安全／安全概览 | 保留 |
| 24 | 受管客户端测试总览 | `Data_Statistics`，默认关闭 | 现有统计与上传路径 | 当前无完整集中查询操作 | 仅发现上传 RPC | 项目与安全／安全概览 | 隐藏入口，不删除底层 |
| 25 | 长时与多用户可靠性 | 无单独路由 | 引擎状态、日志与诊断 | 查看状态和诊断 | 现有状态与日志接口 | 系统设置／日志和诊断 | 保留诊断入口，不伪造指标 |
| 26 | 安全检测或风险评估，星标 | `Beta_ConfigNetwork` 与文档入口 | 安全设置、风险登记文档 | 查看配置与材料说明 | 现有配置接口 | 系统设置／安全设置 | 保留，真实报告仍属外部材料 |
| 27 | 指定加密算法规范，星标 | `Codec`、`Beta_ConfigNetwork` | 算法方法与安全设置 | 选择算法和参数 | 引擎算法调用 | 系统设置／安全设置 | 保留，规范符合性不得虚标 |
| 28 | 用户权限控制，星标 | `AccountAdminPage`、`RoleAdminPage` | 用户列表、组织树、角色权限 | 新建、编辑、停用、重置密码、分配角色 | `/api/urm`、`/api/roles`、`/api/department` | 团队协作／用户管理与角色权限 | 保留 |
| 29 | 密码复杂度，星标 | `SetPassword`、`AccountAdminPage` | 密码表单与规则 | 输入校验、提交、重置 | 用户接口与客户端规则 | 系统设置／密码策略 | 保留 |
| 30 | 密码非明文存储，星标 | `ConfigPrivateDomain` 与客户端凭据状态 | 服务连接表单、凭据存储适配 | 登录、退出、清除旧字段 | 外部登录接口与安全存储 | 团队协作／服务连接；系统设置／密码策略 | 保留真实说明，服务端状态不虚标 |
| 31 | 已知漏洞修复说明，星标 | 关于与安全文档入口 | `HelpDoc`、漏洞管理文档 | 查看版本、法律与修复说明 | 本地文档与版本信息 | 系统设置／关于与安全设置 | 保留 |
