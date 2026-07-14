# RY-BL-20260713-01 基线说明

## 一、范围

本基线将功能要求工作簿中的三十一项编号需求映射到 qsh 分支提交
3abd2868b7646af68e1e1d71c679ecd79e8926f2 的当前源码。调查只读取需求表和仓库文件，产物仅包含
AGENTS.md 与 docs/renyan 目录中的文档。

## 二、需求源

| 字段 | 复验值 |
| --- | --- |
| 文件 | D:\Desktop\Project\yakit围标\功能要求.xls |
| 文件长度 | 25600 字节 |
| 修改时间 | 2026-07-13 16:39:15 |
| SHA-256 | F16C9C671CD3D7580027F0069146C6649907306D479624B6A50AD0125DE7D05D |
| 工作表数量 | 3 |
| 有效工作表 | Sheet1 |
| 主表范围 | 33 行、4 列 |
| 编号需求 | 31 项 |
| 功能要求 | 24 项 |
| 非功能要求 | 7 项 |
| 星标要求 | 14 项 |
| 合并区域 | 13 个 |

Sheet2 与 Sheet3 的使用区域均为一个空单元格。Sheet1 的第一行为表头，第二至第三十三行为需求数据；
其中第二十八行没有编号，是第二十六项的附注。工作簿将 A27:A28 合并，因此附注归入 RY-NF-026。

2026 年 7 月 14 日阶段八复验得到上述当前字节摘要。只读提取的三十一项描述及第二十六项附注与需求追踪表逐项比较，差异数量为零；稳定编号、分类、星标和需求原文不变，因此沿用当前基线编号并更新需求源摘要。

## 三、分类继承

工作簿以合并单元格表达大类和小类继承。追踪表按下列范围保存分类，不根据相邻文字重新分组。

| 工作簿范围 | 继承分类 | 对应编号 |
| --- | --- | --- |
| B2:B25 | 功能性要求 | RY-F-001 至 RY-F-024 |
| C2:C5 | 星标流量交互劫持能力 | RY-F-001 至 RY-F-004 |
| C6:C7 | 星标报文修改重放能力 | RY-F-005 至 RY-F-006 |
| C8:C9 | 历史流量记录功能 | RY-F-007 至 RY-F-008 |
| C10:C12 | 漏洞检测能力 | RY-F-009 至 RY-F-011 |
| C13 | 爆破测试能力 | RY-F-012 |
| C14 | 报文差异对比能力 | RY-F-013 |
| C15:C16 | 编/解码能力 | RY-F-014 至 RY-F-015 |
| C17:C19 | 插件管理能力 | RY-F-016 至 RY-F-018 |
| C20:C21 | 星标团队协作/共享能力 | RY-F-019 至 RY-F-020 |
| C22:C23 | 项目管理能力 | RY-F-021 至 RY-F-022 |
| C24:C25 | 安全概览 | RY-F-023 至 RY-F-024 |
| B26:B33 | 非功能性要求 | RY-NF-025 至 RY-NF-031 |
| C26 | 可靠性要求 | RY-NF-025 |
| C27:C33 | 星标安全性要求 | RY-NF-026 至 RY-NF-031 |

## 四、代码基线

| 字段 | 值 |
| --- | --- |
| 分支 | qsh |
| 提交 | 3abd2868b7646af68e1e1d71c679ecd79e8926f2 |
| 跟踪分支 | origin/qsh |
| 远端地址 | https://github.com/sharptornadoqsh/yakit.git |
| 本地与跟踪差异 | 左侧 0、右侧 0 |
| 代码索引 | 1748 个文件、33112 个节点、94214 条边，状态为最新 |

写入前已使用只读远端查询确认 refs/heads/qsh 与本地提交一致。仓库只配置 origin，没有记录其他写入远端。

## 五、静态调查范围

| 能力域 | 主要证据 |
| --- | --- |
| 流量劫持与证书 | app/renderer/src/main/src/pages/mitm/MITMPage.tsx；app/renderer/src/main/src/pages/mitm/MITMServerStartForm；app/renderer/src/main/src/pages/mitm/MITMServerHijacking |
| 历史流量与筛选 | app/renderer/src/main/src/components/HTTPHistory.tsx；app/renderer/src/main/src/components/HTTPFlowTable |
| 通用与专项检测 | app/renderer/src/main/src/components/HTTPFlowTable/useHTTPFlowTableContextMenu.tsx；app/renderer/src/main/src/pages/simpleDetect；app/renderer/src/main/src/pages/plugins/pluginBatchExecutor |
| 报告与漏洞字段 | app/renderer/src/main/src/pages/assetViewer/ReportViewerPage.tsx；app/renderer/src/main/src/pages/risks/schema.ts；app/main/handlers/assets.js |
| 爆破与字典 | app/renderer/src/main/src/pages/securityTool/newBrute；app/renderer/src/main/src/defaultConstants/NewBrute.ts |
| 对比与编解码 | app/renderer/src/main/src/pages/compare/DataCompare.tsx；app/renderer/src/main/src/pages/codec/NewCodec.tsx；app/renderer/src/main/src/utils/encodec.tsx |
| 插件 | app/renderer/src/main/src/pages/pluginEditor；app/renderer/src/main/src/pages/plugins；app/renderer/src/main/src/pages/pluginHub |
| 项目与远程引擎 | app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx；app/main/handlers/project.js |
| 角色与凭据 | app/renderer/src/main/src/pages/loginOperationMenu/RoleAdminPage.tsx；app/renderer/src/main/src/components/ConfigPrivateDomain/ConfigPrivateDomain.tsx |

调查采用最新的本地 CodeGraph 索引定位跨模块关系，并用当前磁盘源码与精确文本检索复查关键定义。证据路径
是源码定位入口，不替代真实服务端、产品安装包或多用户环境测试。

## 六、状态分布

| 状态 | 数量 | 需求编号 |
| --- | ---: | --- |
| 充分静态证据 | 16 | RY-F-001 至 RY-F-012、RY-F-014、RY-F-016、RY-F-022、RY-F-023 |
| 部分静态证据 | 10 | RY-F-013、RY-F-015、RY-F-018 至 RY-F-021、RY-NF-028、RY-NF-029、RY-NF-030、RY-NF-031 |
| 未发现直接证据 | 2 | RY-F-017、RY-F-024 |
| 待动态验证 | 1 | RY-NF-025 |
| 待外部材料 | 2 | RY-NF-026、RY-NF-027 |
| 存在冲突风险 | 0 | 无 |

总数为三十一项。每项的原文、证据边界和后续验收方式见
[需求追踪表](requirements-traceability.md)。

## 七、环境与限制

- 调查环境为 Windows，Node.js 版本 22.13.0，Yarn 版本 1.22.22，Python 版本 3.12.13。
- 根目录和两个渲染器依赖目录当前均存在；阶段八只执行四个定向测试文件，没有执行全量测试、类型检查或产品构建。
- 文档采用本地 Markdown 解析器、编号与链接检查、编码检查、Git 差异检查作为可重复验证。
- sequential-thinking、shrimp-task-manager、desktop-commander、context7 与 github.search_code 在当前会话不可用；
  其缺失不影响本地需求源复验和当前源码证据检查，替代方法及结果记录于验证报告。
- 可靠性、外部检测报告、外部规范符合性和供应商漏洞处置材料不能由当前仓库静态证据判定。

## 八、阶段九验收叠加层

阶段九重新读取同一需求源，文件摘要仍为
`F16C9C671CD3D7580027F0069146C6649907306D479624B6A50AD0125DE7D05D`，工作簿结构仍为一个有效工作表、
三十三个使用行和四个使用列。需求原文、稳定编号及上述基线证据强度没有改写。

`REQUIREMENTS_MATRIX.md` 新增的是开发模式交付状态叠加层。该层综合当前源码、既有测试、阶段九页面查看、
外部服务列表返回和明确缺失的验收条件，不替代本基线的静态证据分类。导航同步修订只影响一级分组选中状态，
不改变任一需求原文、业务接口、外部服务契约或许可证行为。
