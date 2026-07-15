# 项目上下文摘要（前端品牌残留清理）

生成时间：2026-07-15 09:58:00 +08:00

## 一、任务边界

本任务只处理正常启动时的窗口展示、用户可见旧品牌、用户主动生成文件的默认名称和三份指定交付文档。引擎初始化、下载校验、远程过程调用、进程间通信、接口路径、数据库字段、固定目录、自动更新协议、许可证与上游归属均保持原状。

`StartupPage` 同时承载工作区选择、本地与远程模式选择、引擎存在性检查、预置恢复、启动探活、错误恢复和日志入口，因此不能删除其运行职责。窗口调查证明主窗口可以在引擎凭据到达前完成基础渲染，随后通过既有通知取得连接数据。实现保留初始化窗口及其生命周期，但将其默认隐藏，由主窗口在渲染就绪后直接显示；系统内主动切换引擎时仍可显示原管理界面。

## 二、相似实现分析

- `app/renderer/engine-link-startup/src/App.tsx` 与 `app/renderer/engine-link-startup/src/pages/StartupPage/index.tsx`
  - 模式：页面标题、静态标志和说明读取集中产品配置；引擎状态由既有生命周期模型与组件呈现。
  - 可复用：`productConfig.displayName`、`productConfig.tagline`、`EngineLifecyclePanel`、`EngineLog`。
  - 约束：只能改展示结构与资源引用，不能改 `decideEngineStartup`、看门狗、模式状态和主窗口完成通知。

- `app/renderer/src/main/src/pages/mitm/MITMServerStartForm/MITMCertificateDownloadModal.tsx`
  - 模式：依据证书类型选择名称，再通过 `saveABSFileToOpen` 调起保存动作并写入原始证书字节。
  - 可复用：现有保存接口与证书类型分支。
  - 约束：只改默认名称，字节内容、编码、下载接口和扩展名保持原状。

- `app/renderer/src/main/src/pages/mitm/MITMRule/MITMRuleConfigure/MITMRuleConfigure.tsx`
  - 模式：业务组件提供默认导出名称，主侧既有导出接口生成内容。
  - 可复用：现有规则导出流程。
  - 约束：只替换用户文件名前缀，不改规则结构或接口名。

- `app/renderer/src/main/src/components/HTTPFlowTable/HTTPFlowTable.tsx`
  - 模式：`handleSaveFileSystemDialog` 接收 `defaultPath` 和扩展名过滤器，流量导出沿用原时间戳。
  - 可复用：现有保存对话框和时间戳逻辑。
  - 约束：保留 `.har` 过滤器与导出请求，只调整默认名称。

- `app/renderer/src/main/src/utils/openWebsite.tsx`
  - 模式：通用下载入口把调用方提供的名称交给 `showSaveDialog`，保存成功后沿用既有提示与打开文件行为。
  - 可复用：`saveABSFileToOpen` 与保存对话框桥。
  - 约束：调用方负责提供符合业务格式的名称，不新增第二套保存实现。

## 三、项目约定

- 组件与类型采用大驼峰，函数和变量采用小驼峰，内部既有 `Yakit` 与 `Yaklang` 标识不重命名。
- 代码使用两空格、单引号、无分号、尾逗号；文件保持 UTF-8 无 BOM。
- 测试位于相邻 `__test__` 目录，启动状态测试使用 Vitest 与组件渲染断言。
- 产品身份读取 `product/renyan.json` 及两端 `config/product.ts`，不复制新的品牌常量。
- 语言资源位于 `app/renderer/src/main/public/locales/{zh,en,zh-TW}`，只改值，不改键。

## 四、可复用组件与接口

- `productConfig.displayName`、`productConfig.shortName`、`productConfig.tagline`：产品身份来源。
- `EngineLifecyclePanel`、`EngineLog`、`SoftwareBasics`、`LocalEngine`、`RemoteEngine`：启动状态与恢复动作。
- `saveABSFileToOpen`、`handleSaveFileSystemDialog`、`yakitDialog.showSaveDialog`：用户文件保存入口。
- `getReleaseEditionName`：客户端可见版本类别名称。
- `useI18nNamespaces`：主渲染端语言资源读取。

## 五、测试与验证策略

- 启动展示：静态检查初始化窗口默认隐藏、主窗口就绪即显示、刷新保持主窗口可见，右侧装饰资源不再被引用；启动生命周期定向测试继续通过，开发模式检查窗口可见性与页面载入。
- 品牌文案：解析三种语言资源值；使用语法树提取字符串值，对残留按可见内容、固定目录、技术语言、接口标识和法律归属分类。
- 文件名称：检查证书、规则、流量、风险结果、截图和已发现的保存对话框默认值；验证扩展名与原分支一致。
- 代码质量：执行相关定向测试、JSON 解析、代码索引同步、`git diff --check`、分支与状态检查；不执行目标文件禁止的全量检查、构建或打包。

## 六、依赖与集成点

- 外部依赖：React、Electron、Vitest 和现有保存桥，均不新增或升级。
- 内部依赖：启动渲染端通知主进程完成初始化；主渲染端经既有桥调用主侧保存与引擎导出接口。
- 配置来源：`product/renyan.json`、两端产品配置模块和现有语言资源。
- 环境要求：Node.js 现有依赖目录可用；开发模式使用仓库既有双渲染与桌面端命令，不生成安装包。

## 七、技术选择与风险

- 采用逐项修改，不执行全仓库替换；内部兼容标识数量远多于界面文案，机械替换会破坏通信和固定路径。
- 右侧启动面板仅为静态装饰，取消引用不会影响生命周期；初始化窗口隐藏后仍持续载入，工作区配置、状态区和恢复动作保持可用。
- `yakit-projects` 是固定目录，界面说明可移除虚构的 `~Yakit` 前缀，但目录本身不能更名。
- `Yaklang` 作为脚本语言、系统环境变量名称和代码审计语言时保留；作为引擎产品显示名称时改为 `RuiYan Engine`。
- 证书当前实际内容为 PEM 编码且名称使用复合扩展名 `.crt.pem`；本任务保留编码和最终 `.pem` 扩展名，只改为 `RuiYan-MITM-CA.pem` 与 `RuiYan-MITM-GM-CA.pem`。
- 初始化窗口的运行职责不能删除，但正常启动路径不再显示该窗口；跨平台和全产品变体不验证，均需写入交付文档。

## 八、充分性检查

- 接口契约：已明确输入为现有产品配置、生命周期状态和业务导出数据，输出为直接显示主窗口、后台初始化与用户文件默认名称。
- 技术选择：已证明删除初始化职责会牵涉生命周期迁移，而隐藏初始化窗口并提前显示主窗口无需改变通信协议。
- 主要风险：已识别固定目录、脚本语言、通信通道、扩展名、共享资源和法律归属误改风险。
- 验证方式：已找到相邻测试、语言资源解析、语法树筛选、开发模式与最低 Git 检查方式。
- 重复实现：已检查产品配置、保存桥、文件系统对话框和导出组件，不新增同类基础设施。

## 九、工具适用性

当前工具集没有顺序思考、任务管理器、桌面文件管理、编程文档检索和 GitHub 代码搜索接口。结构化推理使用会话计划与本摘要替代，任务拆分使用会话计划替代，本地调查使用 CodeGraph、`rg`、PowerShell 和现有依赖目录完成。任务没有引入库接口或通用算法，外部文档与开源实现不会改变本仓库的品牌规则，因此未进行网页检索。
