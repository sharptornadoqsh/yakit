# 项目上下文摘要（睿眼阶段三引擎生命周期）

生成时间：2026-07-14 11:18:21 +08:00

## 一、任务边界与验收契约

- 工作分支限定为 `qsh`，代码、文档、提交和推送均不得涉及 `master` 或只读上游。
- 修改范围限定于启动渲染端、引擎预加载桥、引擎更新与网络处理、引擎窗口和进程生命周期、打包预置配置、产品配置、主界面引擎状态、测试与 `docs/renyan`。
- 不改变远程过程调用方法名、数据库字段、插件接口、企业版本与许可证判断，不跳过下载校验，不改写上游更新地址。
- 验收重点为离线优先、显式安装、预置包校验、兼容性判断、原子安装、最后可用版本保留、远程模式、后台更新检查及可测试状态模型。
- 需求源 `D:\Desktop\Project\yakit围标\功能要求.xls` 的当前文件长度为二万五千六百字节，修改时间为 2026-07-13 16:39:15 +08:00，摘要为 `7C0FB6DA86E83457B23510F097554A149A2CDC4B4E649B28A44C7ED7CBC91783`。阶段三主要为 `RY-NF-025` 提供可靠性证据，不改变原需求文字或编号。

## 二、开始状态与工具条件

- `git branch --show-current` 输出 `qsh`，初始 `git status --short` 无内容，本地分支相对 `origin/qsh` 领先一个既有提交。
- `git fetch origin --prune` 与 `git pull --ff-only origin qsh` 均因远端返回四百零三而失败；分支和工作区检查不受此错误影响，完成本地验证后仍需再次尝试正常推送。
- CodeGraph 索引当前有效，包含一千七百三十四个文件、三万三千零七个节点和九万三千五百七十条边；跨模块调用关系通过 CodeGraph 获取，文字常量与构建配置采用有界检索。
- 当前工具集中没有顺序思考、任务管理器、桌面文件管理器和编程文档检索接口。需求分析以结构化证据表替代，任务分解由会话计划维护，本地文件使用只读 PowerShell 与 `apply_patch`，外部实现采用 GitHub 限定检索。工具缺失与替代方式写入操作记录。

## 三、相似实现分析

### 三点一、本地引擎启动模式

- 文件：`app/renderer/engine-link-startup/src/pages/StartupPage/LocalEngine/index.tsx`
- 模式：先调用 `check-secret-local-grpc` 判断本地实例及能力，再决定拉起本地进程或复用已有实例。
- 可复用：`startEngine`, `getEngineVersion`, `getEnginePort`, `onEngineLinkError`, `onEngineLinkSuccess`。
- 约束：现有成功路径串联客户端版本、预置版本和在线摘要检查，断网启动仍产生请求；这些检查应移出关键启动路径，能力检查应保留。

### 三点二、下载与安装模式

- 文件：`app/renderer/engine-link-startup/src/pages/StartupPage/DownloadYaklang/index.tsx`
- 文件：`app/main/handlers/upgradeUtil.js`
- 模式：渲染端驱动下载进度，主进程由 `requestWithProgress` 写入版本缓存，随后复制为活动引擎。
- 可复用：现有下载事件、版本地址生成、远程摘要获取、解压工具和进度桥。
- 约束：现有下载直接写最终缓存，安装前没有强制摘要验证；更新时会移除缓存或活动引擎，因此需要临时文件、验证、原子替换和最后可用副本。

### 三点三、预置包恢复模式

- 文件：`packageScript/buildHook/before-pack.js`
- 文件：`app/main/handlers/upgradeUtil.js`
- 模式：构建阶段把平台压缩包复制为 `bins/yak.zip`，运行阶段按平台条目解压并复制到活动路径。
- 可复用：`getExtraResourcesPath`, `getLocalYaklangEngine`, `getLocalYaklangEngineDir`, `node-stream-zip`。
- 约束：平台源文件命名与压缩包内部条目不同；构建和运行阶段均需依据同一兼容清单校验，缺少真实摘要的平台必须保持待定状态。

### 三点四、远程引擎模式

- 文件：`app/renderer/engine-link-startup/src/pages/StartupPage/index.tsx`
- 文件：`app/renderer/engine-link-startup/src/pages/StartupPage/RemoteEngine/index.tsx`
- 模式：读取 `LocalGVS.YaklangEngineMode` 与已保存的主机、端口、传输层安全参数、密码和证书，再调用 `connectYaklangEngine`。
- 可复用：现有远程配置存储、连接桥、成功回调与错误呈现。
- 约束：远程选择必须位于本地探测之前，远程模式不得触发本地下载、解压或进程创建。

### 三点五、测试模式

- 文件：`app/renderer/engine-link-startup/src/pages/StartupPage/LocalEngine/__test__/index.test.tsx`
- 文件：`app/renderer/engine-link-startup/src/components/YaklangEngineWatchDog/__test__/index.test.tsx`
- 文件：`app/renderer/engine-link-startup/src/pages/StartupPage/__test__/utils.test.ts`
- 模式：采用 Vitest、虚拟文档环境、模块替身和相邻 `__test__` 目录，覆盖成功、边界和失败分支。
- 约束：原 `LocalEngine` 测试把启动联网视为预期行为，需要改为验证本地能力通过后不调用在线版本与摘要接口。

## 四、必须记录的八项事实

### 四点一、本地路径与安装判断

- `app/main/filePath.js` 的 `getYakitHome()` 默认返回 `%APPDATA%\RenYan-Pentest\projects`。
- 引擎目录为其下的 `yak-engine`；Windows 活动文件为 `yak.exe`，macOS 与 Linux 为 `yak`。
- `app/main/newUiOperate/yaklangAndYakit.js` 以 `fs.existsSync(getLocalYaklangEngine())` 判断安装状态。

### 四点二、预置包格式与平台命名

- 构建源文件为 `yak_windows_amd64.zip`、`yak_linux_amd64.zip`、`yak_linux_arm64.zip`、`yak_darwin_amd64.zip` 与 `yak_darwin_arm64.zip`，安装包内统一为 `bins/yak.zip`。
- 压缩包条目按平台分别为 `bins/yak_windows_amd64.exe`、`bins/yak_linux_amd64`、`bins/yak_linux_arm64`、`bins/yak_darwin_amd64` 和 `bins/yak_darwin_arm64`。
- 当前 Windows 源压缩包摘要为 `C53708BBBCC322C4C8BCEC344D237D424FD328FC0890F086D176FA3EBC8F3570`，内部引擎摘要为 `808582299FA6E2211EC0268D112D6DE1EE9EAE9824F80CBBD50F16358CE8ADDF`。其余平台未取得真实工件摘要，必须标记 `TBD`。

### 四点三、在线地址生成

- `app/main/handlers/utils/network.js` 先访问 `https://<domain>/yak/latest/version.txt` 选择可用域名。
- 引擎前缀根据产品类别选择 `yaklang_yakit_`、`yaklang_irify_` 或 `yak_`，再以版本、平台、架构及旧系统模式组成下载地址。
- 阶段三继续复用该来源，不增加自有下载域名。

### 四点四、摘要获取与校验

- `getCheckTextUrl` 由下载地址生成同名 `.sha256.txt`，`fetchSpecifiedYakVersionHash` 获取并清理文本。
- `CalcEngineSha265` 能计算本地引擎摘要，但现有下载安装流程没有把摘要匹配作为活动文件替换前置条件。
- 新流程须对下载临时文件和预置工件执行 `SHA256` 验证，摘要缺失或不匹配均不得替换活动引擎。

### 四点五、推荐版本来源

- 当前安装包通过 `bins/engine-version.txt` 提供推荐版本，本地值为 `1.4.8-beta3`；客户端版本为 `1.4.8-0711`。
- 仓库当前没有客户端版本到最低、推荐、最高已验证引擎版本的权威矩阵。
- `check-secret-local-grpc` 是当前有效的运行能力门槛。兼容清单将以该能力结果作为阻断依据，并把未获得权威值的最低版本标记为 `TBD`。

### 四点六、本地与远程差异

- 本地模式负责能力探测、进程创建、端口发现和本地版本读取。
- 远程模式使用保存的地址、凭据和证书连接既有服务，不创建本地进程，不依赖本地文件和预置包。

### 四点七、现有启动联网行为

- 本地引擎存在时，启动页会执行客户端在线版本检查、预置版本比较、引擎在线摘要检查和活动版本列表请求。
- 活动版本列表还会按分钟刷新，因此当前流程在已有兼容引擎时仍会访问网络。

### 四点八、现有更新失败行为

- 下载前会删除同版本缓存，安装前会移除活动引擎，预置恢复也会先移除活动文件。
- 下载、摘要、解压或复制失败时没有可靠的事务边界，旧引擎可能失去可启动状态。
- 阶段三必须在新工件完成验证后才替换活动文件，并保留最后可用副本；中断恢复应优先恢复可验证的旧副本。

## 五、项目约定

- TypeScript 与 JavaScript 使用两空格、单引号、无分号和尾逗号；组件与类型采用大驼峰，函数与变量采用小驼峰，钩子以 `use` 开头。
- 启动渲染端沿用页面、组件、样式模块和相邻测试目录结构；主进程行为保留在 `app/main`。
- 跨进程通信继续使用预加载桥，不新增远程过程调用方法，不改动协议定义。
- 界面文字采用简体中文；代码标识符维持仓库既有英文命名。

## 六、可复用组件与集成点

- `app/main/filePath.js`：活动引擎、引擎目录、额外资源与用户目录定位。
- `app/main/handlers/utils/network.js`：版本、下载地址和远程摘要来源。
- `app/main/handlers/upgradeUtil.js`：下载、解压、安装及进度事件注册。
- `app/main/engineLinkPreload.js`：启动渲染与主进程桥。
- `app/renderer/engine-link-startup/src/pages/StartupPage/grpc.ts`：启动页桥调用封装。
- `app/renderer/engine-link-startup/src/pages/StartupPage/RemoteEngine`：远程连接配置与反馈。
- `app/main/newEngineStatus.js`：本地能力检查及可恢复错误分类。
- `app/main/index.js`：启动窗口、主窗口及 `engineLinkWin-done` 生命周期。
- `app/renderer/src/main/src/pages/layout/UILayout/UILayout.tsx`：主界面可用后的引擎更新入口。

## 七、依赖与数据流

- 输入：用户引擎模式、活动文件、预置压缩包、兼容清单、远程配置、显式安装动作及在线版本元数据。
- 输出：状态模型、可启动引擎、最后可用副本、诊断信息、进度事件、主界面后台更新状态。
- 内部依赖：文件路径、下载请求、流式摘要、压缩包读取、文件系统原子重命名、预加载桥和窗口生命周期。
- 外部条件：下载和摘要服务仅用于用户显式安装及主界面后台检查；离线本地启动和已校验预置恢复不依赖网络。

## 八、测试策略

- 纯函数测试覆盖状态枚举、远程优先、本地兼容、预置工件、缺失、兼容但非推荐和不兼容分支。
- 主进程服务测试采用临时目录，覆盖下载临时文件、摘要不匹配、原子替换、中断恢复、安装失败及最后可用版本保留。
- 组件测试验证兼容本地引擎在断网环境不调用在线接口，缺失状态只呈现用户动作，下载失败提供恢复入口。
- 冒烟测试覆盖断网已有引擎、缺失引擎、下载失败；无法在当前系统执行的平台或真实远程场景记入 `TEST_EVIDENCE.md`，不得标为通过。
- 全局验证依次包含分支、差异格式、相关测试、静态检查、类型检查、全量测试、社区版双渲染构建和 Windows 社区版安装包构建。

## 九、技术决策与风险

- 兼容性采用两层判断：运行能力检查决定是否阻断，版本清单决定推荐更新和已验证范围。这样不会用未经证实的最低版本值替代真实能力证据。
- 兼容清单放入 `product/engine-compatibility.json`，供构建脚本、主进程和文档共同引用；Windows 当前工件记录真实摘要，其他平台保持 `TBD`。
- 安装事务采用同目录临时文件、最后可用副本和原子重命名，避免跨卷替换语义差异。
- 主要风险包括远端四百零三影响最终推送、非 Windows 工件缺少真实摘要、真实远程服务缺少动态环境、全量构建和打包耗时较长。

## 十、上下文充分性检查

- 可以定义接口契约：状态决策输入、兼容结果、工件描述、安装结果与进度事件均已明确。
- 理解技术选型：现有能力检查、版本来源、下载地址、摘要端点和打包命名均有当前源码或工件证据。
- 识别主要风险：联网依赖、摘要缺失、中断替换、平台差异、远程环境和推送权限均已记录。
- 知道验证方式：已有 Vitest 结构、主进程临时目录测试、启动组件测试、构建和打包指令均已定位。
- 已确认三个以上相似实现、可复用组件、命名风格、测试模式和集成位置，可以进入测试与实现阶段。
