# 需求追踪表

## 一、使用说明

本表逐项保存功能要求工作簿的编号、合并单元格继承分类、星标、原文、基线状态、源码证据边界和后续
验收方式。基线状态只描述 RY-BL-20260713-01 的证据强度，不表示采购验收或合规结论。状态定义见
[目录说明](README.md)。

证据栏中的路径均相对于仓库根目录。文件入口、数据类型或调用路径只能证明当前源码存在相应设计；
涉及服务端、多用户、长时间运行、外部报告和外部规范的结论，仍须按验收栏取得独立证据。

## 二、功能要求

| 稳定编号 | 源编号 | 继承小类 | 星标 | 需求原文 | 基线状态 | 源码证据与缺失项 | 后续验收方式 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| RY-F-001 | 1 | *流量交互劫持能力 | 是 | 客户端支持http流量拦截与修改，支持自动生成SSL证书，用户可手动在客户端中导入该证书，并设置代理，从而实现HTTPS流量拦截与修改。 | 充分静态证据 | app/renderer/src/main/src/pages/mitm/MITMPage.tsx 提供劫持入口；app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMCertificateDownloadModal.tsx 调用 DownloadMITMCert 并保存证书；MITMServerStartForm.tsx 保存代理与证书配置。静态证据不能证明各操作系统证书导入结果。 | 启动代理，下载并导入证书，分别提交 HTTP 与 HTTPS 请求，保存修改前后报文和服务端接收结果。 |
| RY-F-002 | 2 | *流量交互劫持能力 | 是 | 客户端支持请求/响应双向拦截。 | 充分静态证据 | app/renderer/src/main/src/pages/mitm/MITMServerHijacking/MITMHijackedContent.tsx 同时引用请求与响应劫持、转发接口；MITMPage.tsx 的 MITMResponse 包含 request、response 与 forResponse。 | 对同一 HTTPS 事务分别暂停请求和响应，记录两个编辑界面及转发后的完整事务。 |
| RY-F-003 | 3 | *流量交互劫持能力 | 是 | 客户端支持流量自动放行、手动劫持、丢弃。 | 充分静态证据 | MITMPage.tsx 保存 autoForward 模式；MITMHijackedContent.tsx 调用 grpcMITMAutoForward，并从 MITMManual 引入 dropRequest 与 dropResponse。 | 以同一目标分别验证自动放行、手动暂停、请求丢弃和响应丢弃，保存网络结果。 |
| RY-F-004 | 4 | *流量交互劫持能力 | 是 | 客户端支持配置匹配规则（匹配URL、Host、Header等要素），自动放行流量。 | 充分静态证据 | app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMFilters.tsx 定义主机名、URI、方法及多种匹配器；MITMFiltersModal.tsx 区分过滤与条件劫持并同步到引擎。 | 建立 URL、Host、Header 正反例规则，提交匹配与不匹配请求，记录自动放行决策。 |
| RY-F-005 | 5 | *报文修改重放能力 | 是 | 客户端在劫持网络流量后，支持篡改传输中的报文内容，再将其转发给目标服务器。 | 充分静态证据 | MITMHijackedContent.tsx 引用 grpcMITMForwardModifiedRequest 与 grpcMITMForwardModifiedResponse，并维护请求、响应编辑状态。 | 修改请求头、请求体和响应体后转发，分别保存目标服务端与客户端收到的字节。 |
| RY-F-006 | 6 | *报文修改重放能力 | 是 | 客户端在劫持网络流量后，支持选择任意请求报文，重复发送给服务器。 | 充分静态证据 | app/renderer/src/main/src/components/HTTPHistory.tsx 暴露发送至 Web Fuzzer 的行为；app/renderer/src/main/src/components/HTTPFlowTable/useHTTPFlowTableContextMenu.tsx 为历史流量提供重发相关菜单。 | 从历史流量选择任意请求连续发送两次，比较请求内容、响应和服务端计数。 |
| RY-F-007 | 7 | 历史流量记录功能 | 否 | 客户端支持查看所有经过代理的完整请求与响应报文。 | 充分静态证据 | HTTPHistory.tsx 查询 HTTP 流量；app/renderer/src/main/src/components/HTTPFlowTable/HTTPFlowTable.tsx 读取请求与响应字段并展开流量详情。 | 产生多种状态码和内容类型的代理流量，逐条比对捕获报文与历史详情。 |
| RY-F-008 | 8 | 历史流量记录功能 | 否 | 客户端支持关键字、正则、状态码、Hostname维度进行匹配，筛选目标请求与响应报文。 | 充分静态证据 | HTTPFlowTable.tsx 使用 SearchURL、StatusCode、hostName 和关键词筛选；app/renderer/src/main/src/components/HTTPFlowTable/HTTPFlowRuleDataFilter.tsx 提供规则与关键词过滤。 | 准备可区分样本，分别用关键字、正则、状态码和 Hostname 过滤并核对结果集合。 |
| RY-F-009 | 9 | 漏洞检测能力 | 否 | 客户端通用漏洞检测能力：支持人工选择测试流量报文，发送至对应通用漏洞扫描器，进行通用漏洞检测(SQL注入、XSS等)，并支持批量扫描，检测完成后输出结果。 | 充分静态证据 | useHTTPFlowTableContextMenu.tsx 将单条和批量选中流量交给 PacketScanner；app/renderer/src/main/src/pages/plugins/pluginBatchExecutor/HybridScanTaskListDrawer.tsx 管理批量混合扫描任务。 | 选择含可验证 SQL 注入与 XSS 样本的单条及多条流量，完成扫描并导出结果。 |
| RY-F-010 | 10 | 漏洞检测能力 | 否 | 客户端专项漏洞检测能力：支持人工选择测试目标URL/IP/域名，发送至对应专项漏洞扫描器，进行专项漏洞检测(fastjson、shiro等)，并支持批量扫描，检测完成后输出结果。 | 充分静态证据 | app/renderer/src/main/src/pages/simpleDetect/SimpleDetect.tsx 提供目标与专项检测任务入口，并关联任务恢复、报告和额外参数；混合扫描任务模型保存首个目标和目标筛选。 | 使用隔离的 fastjson、shiro 目标以及 URL、IP、域名批量清单完成扫描，核对每个目标的结果。 |
| RY-F-011 | 11 | 漏洞检测能力 | 否 | 客户端支持生成安全漏洞测试报告，格式需支持Word、PDF或HTML。报告内容须包含漏洞详细参数，原始http请求/响应、风险评级及修复建议。 | 充分静态证据 | app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.tsx 实现 Word、PDF、HTML 导出；app/renderer/src/main/src/pages/risks/schema.ts 定义 Parameter、Request、Response、Severity 与 Solution；app/main/handlers/assets.js 处理 HTML 与 PDF。 | 建立含全部必填字段的漏洞记录，分别导出三种格式并逐字段检查文档内容。 |
| RY-F-012 | 12 | 爆破测试能力 | 否 | 客户端支持高并发爆破测试，支持挂载字典。 | 充分静态证据 | app/renderer/src/main/src/pages/securityTool/newBrute/NewBruteType.d.ts 定义 Concurrent、用户名字典、密码字典和文件参数；app/renderer/src/main/src/defaultConstants/NewBrute.ts 默认并发为 50。 | 在隔离目标上挂载自定义字典，以多个并发值执行，核对任务速率、结果和取消行为。 |
| RY-F-013 | 13 | 报文差异对比能力 | 否 | 客户端提供请求、响应、自定义文本对比模块，支持按文本、字节对多个请求/响应报文进行可视化差异高亮比对 | 部分静态证据 | app/renderer/src/main/src/pages/compare/DataCompare.tsx 提供左右文本与 Monaco 差异视图；当前调查未发现独立的按字节比较模式或多于两份报文的直接证据。 | 验证请求、响应和自定义文本入口；增加二进制差异样本并确认字节视图、多报文选择与高亮规则。 |
| RY-F-014 | 14 | 编/解码能力 | 否 | 客户端支持主流编/解码格式如Base64、HTML、URL、双重URL、十六进制、Unicode（含中文）等。 | 充分静态证据 | app/renderer/src/main/src/pages/codec/NewCodec.tsx 从 GetAllCodecMethods 获取方法并提供十六进制视图；app/renderer/src/main/src/utils/encodec.tsx 明确定义 Base64、HTML、URL 组合等方法。 | 对每种格式执行编码、解码和往返测试，包含中文、空输入、无效输入和双重 URL 样本。 |
| RY-F-015 | 15 | 编/解码能力 | 否 | 客户端支持SM1/SM2/SM3/SM4等国密算法加解密，支持AES、RSA等对称/非对称加解密。 | 部分静态证据 | 编解码方法由引擎动态返回；仓库内可定位 SM2、SM4、AES、RSA 的调用或模板，未发现可直接确认 SM1 与 SM3 加解密入口的前端证据。 | 获取引擎方法清单，对 SM1、SM2、SM3、SM4、AES、RSA 分别执行已知向量测试并保存算法参数。 |
| RY-F-016 | 16 | 插件管理能力 | 否 | 客户端支持插件编写、调试、日志输出功能。 | 充分静态证据 | app/renderer/src/main/src/pages/pluginEditor/pluginEditor/PluginEditor.tsx 提供代码编辑、保存和调试关联；app/renderer/src/main/src/pages/plugins/operator/pluginExecuteResult/LocalPluginLog.tsx 展示多级日志及文件结果。 | 编写包含正常输出与错误日志的插件，完成保存、调试、停止和日志导出验证。 |
| RY-F-017 | 17 | 插件管理能力 | 否 | 客户端支持不同插件间相互调用，插件运行结束后，其输出可作为下一个插件的输入，以实现链路的可视化展示。 | 未发现直接证据 | 已调查插件编辑器、执行器、结果视图和插件仓库，未定位到将前一插件输出绑定为后一插件输入并可视化展示链路的直接实现。 | 提供产品入口或设计资料；建立两个插件的输出输入契约，验证链路编辑、执行顺序、失败传播和可视化结果。 |
| RY-F-018 | 18 | 插件管理能力 | 否 | 客户端和服务端支持查询、新增、修改、删除仓库插件以及对分类分组，支持一键批量导入插件。 | 部分静态证据 | app/renderer/src/main/src/pages/pluginHub/pluginHubList/PluginHubList.tsx 包含本地、线上、回收站和分组入口；PluginUploadModal.tsx 支持新增与修改上传。完整服务端 CRUD、一键批量导入和权限结果未由当前仓库端到端证明。 | 连接目标服务端，对插件执行查询、新增、修改、删除、分类、分组和批量导入，审计服务端状态。 |
| RY-F-019 | 19 | *团队协作/共享能力 | 是 | 客户端支持团队多人协作，可通过连接同一服务端，实现测试数据、测试结果共享。 | 部分静态证据 | app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx 接受本地或远程引擎模式并管理项目；仓库存在远程引擎连接模型。缺少两个独立用户共享同一测试数据与结果的运行证据。 | 使用两个不同账号连接同一服务端，分别创建、读取和更新测试流量、漏洞结果，记录隔离与同步行为。 |
| RY-F-020 | 20 | *团队协作/共享能力 | 是 | 服务端支持自定义角色权限，支持定义管理员、测试人员等角色。 | 部分静态证据 | app/renderer/src/main/src/pages/loginOperationMenu/RoleAdminPage.tsx 提供角色列表、创建、删除和操作权限界面，并调用 roles 接口。服务端角色持久化与强制授权不在当前前端仓库内。 | 在服务端建立管理员和测试人员角色，以不同账号验证允许与拒绝的操作并检查服务端审计记录。 |
| RY-F-021 | 21 | 项目管理能力 | 否 | 客户端支持项目新建、编辑、删除、查看等操作，服务端支持创建项目组。 | 部分静态证据 | ProjectManage.tsx 调用 GetProjects、NewProject、UpdateProject、DeleteProject 并维护 FolderId、ChildFolderId；app/main/handlers/project.js 转发相关接口。服务端项目组语义和多用户持久化仍需验证。 | 完成项目与项目组的新建、编辑、查看、删除以及跨客户端读取，核对服务端层级关系。 |
| RY-F-022 | 22 | 项目管理能力 | 否 | 客户端支持导入、导出功能，支持加密导入导出项目。 | 充分静态证据 | ProjectManage.tsx 提供项目导入、导出及 Password 参数；app/main/handlers/project.js 注册 ExportProject、ImportProject 及取消处理。 | 用密码导出项目，验证错误密码失败、正确密码导入成功、内容一致和取消行为。 |
| RY-F-023 | 23 | 安全概览 | 否 | 客户端支持查看本地项目的测试记录，包括历史测试流量、发现的测试漏洞结果。 | 充分静态证据 | HTTPHistory.tsx 按项目查询历史流量；app/renderer/src/main/src/pages/risks/schema.ts 定义漏洞及关联请求响应字段，项目界面提供本地项目入口。 | 在本地项目产生流量和漏洞记录，重启客户端后按项目核对两类历史数据。 |
| RY-F-024 | 24 | 安全概览 | 否 | 服务端支持查看所纳管客户端测试记录，包括历史测试流量、发现的测试漏洞结果。 | 未发现直接证据 | 当前调查定位到客户端本地历史与漏洞视图，但未发现服务端纳管客户端清单及其历史流量、漏洞结果总览的直接实现。 | 提供服务端管理入口和接口，在两个受管客户端产生数据后验证集中查询、筛选和权限隔离。 |

## 三、非功能要求

| 稳定编号 | 源编号 | 继承小类 | 星标 | 需求原文 | 基线状态 | 源码证据与缺失项 | 后续验收方式 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| RY-NF-025 | 25 | 可靠性要求 | 否 | 产品满足具备稳定运行能力，在多项目并行测试及多用户操作场景下能够持续稳定运行，在长时间运行过程中不出现崩溃或严重性能退化情况。 | 待动态验证 | 阶段三新增离线优先引擎启动、双摘要预置恢复、可恢复安装事务、最后可用版本和后台更新降级，并以单元测试覆盖下载失败、摘要不一致、提取失败、安装中断和更新失败。上述证据只覆盖客户端引擎生命周期，仍不能证明多项目、多用户、持续运行资源占用、崩溃率或性能退化。 | 定义项目数、用户数、任务负载、持续时长和资源上限，执行长时多用户测试并保存性能曲线与异常记录；同时注入引擎下载、安装和更新故障，验证旧版本持续可用。 |
| RY-NF-026 | 26 | *安全性要求 | 是 | 供应商应提供针对产品的安全检测或风险评估报告，并对报告中发现的问题进行处置。<br>附注原文：注：如采购产品后续需面向互联网提供服务，需要求供应商在产品上线前提供第三方安全检测报告） | 待外部材料 | 阶段八已建立客户端风险识别、问题登记、处置措施和第三方材料清单，但当前没有真实检测机构、日期、编号、受测版本或报告结论。 | 收集报告原件、检测范围、报告日期、问题清单、处置证据；互联网服务上线前核验第三方报告与实际部署一致。 |
| RY-NF-027 | 27 | *安全性要求 | 是 | 产品如涉及密码技术，所使用加密算法应满足中国工商银行《应用安全技术规范》中加密算法（国密SM系列算法、AES、RSA）的要求。 | 待外部材料 | 仓库出现多种算法入口，但未提供所引用规范的受控版本、适用条款、参数限制和正式符合性材料。 | 获取规范版本与适用条款，建立算法、模式、密钥长度、参数和使用场景清单，逐项形成符合性证据。 |
| RY-NF-028 | 28 | *安全性要求 | 是 | 产品应提供用户权限管理功能，控制用户根据既定的访问权限和访问方式进行访问。 | 部分静态证据 | 客户端存在用户、角色和权限页面，并对管理员入口实施角色门槛；阶段八没有低权限账号，不能证明外部服务对 `/api/urm`、`/api/urm/edit`、`/api/urm/reset/pwd`、`/api/roles` 和 `/api/roles/detail` 实施授权。 | 建立角色权限矩阵，用不同角色直接访问界面和接口，验证允许、拒绝、越权和权限变更生效。 |
| RY-NF-029 | 29 | *安全性要求 | 是 | 用户初始设置或变更静态密码时，对其进行复杂度检查 | 部分静态证据 | 阶段八统一客户端密码规则，覆盖八至二十位、大小写字母、数字、特殊字符和完整字符串边界；新建与重置密码由外部服务生成，服务端强制校验未验证。 | 使用外部服务测试账号验证初始、修改和重置场景，并绕过前端直接提交弱密码，确认服务端拒绝。 |
| RY-NF-030 | 30 | *安全性要求 | 是 | 不应在配置文件、数据库、程序代码等载体中明文存储用户密码。 | 部分静态证据 | 阶段八停止保存私有域原始密码和 Base64 密码，读取旧 `pwd` 时清除并改写配置；客户端有界检索未发现账号密码持久化。外部服务端数据库存储方式仍未知。 | 获取服务端源码、数据库结构或检测报告，确认盐值、派生算法、参数和历史迁移；复验客户端旧配置清理。 |
| RY-NF-031 | 31 | *安全性要求 | 是 | 对于CVE、CNVD等公开渠道通告的产品本身的漏洞，供应商应提供已知漏洞修复的相关说明；对于产品使用的第三方或开源组件的安全漏洞，供应商应提供已知漏洞修复的相关说明。 | 部分静态证据 | `VULNERABILITY_MANAGEMENT.md` 已登记当前账号服务接入路径的已知问题、影响、严重程度、状态、措施和责任边界；阶段八没有执行全量依赖审计或生成完整产品漏洞清单。 | 获取软件物料清单、产品与依赖漏洞清单、修复版本、公告和例外说明，按发布日期与交付版本逐项核验。 |

## 四、基线结论

三十一项需求均已取得唯一稳定编号并保留原文。静态证据较充分的项目仍须接受真实环境验证；部分证据、
无直接证据、动态指标、外部材料和冲突风险均已给出明确的后续验收方式。阶段零不改变这些缺失项的状态，
也不开展实现工作。
