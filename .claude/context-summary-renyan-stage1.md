# 项目上下文摘要（睿眼产品化阶段一）

生成时间：2026-07-13 16:04:20 +08:00

## 一、目标、范围与前提

本阶段只变更产品身份、构建元数据、品牌资源、窗口、系统菜单、托盘、关于信息和默认数据目录。协议名、通信通道、路由枚举、数据库字段、插件接口、引擎文件协议与业务模块保持原状。当前操作系统为 Windows，必须验证社区版渲染构建、无签名安装包和桌面应用界面。

当前分支为 `qsh`，工作区初始状态无变更，`origin` 的读取与写入地址均为 `https://github.com/sharptornadoqsh/yakit.git`。仓库没有配置指向上游的可写远端。

采用 `io.github.sharptornadoqsh.renyan` 作为阶段性应用标识，依据是用户给出的建议值和派生仓库命名空间。发布证书与域名归属尚无材料，必须在 `docs/renyan/DECISIONS.md` 记录其待签名验证属性。

## 二、现有实现分析

### 实现一：构建变体与产物命名

- `packageScript/electron-builder.config.js` 通过 `PLATFORM` 选择产品名、应用标识、文件清单与各平台图标。
- `packageScript/buildHook/before-pack.js` 依据目标平台和架构设置产物名称并装配引擎压缩包。
- 可复用模式是“公共构建配置加平台钩子”。产品公共字段应改由一个结构化配置文件提供，变体分支只保留版型和既有载荷选择。
- 关键约束是 `artifactName` 的平台、版本、架构结构不能丢失，`bins/yak.zip` 等引擎文件协议不能改名。

### 实现二：主进程生命周期、菜单与持久化路径

- `app/main/index.js` 创建引擎启动窗口和主窗口，并在应用就绪后注册通信与窗口生命周期。
- `app/main/menu.js` 定义 macOS 应用菜单、开发菜单与帮助菜单。
- `app/main/filePath.js` 是配置、缓存、引擎、日志、项目和临时文件路径的统一来源。
- 可复用模式是“主进程统一持有窗口对象，路径模块统一派生所有目录”。独立产品数据根目录应在任何路径模块载入前设置，默认项目目录再从新的 `userData` 派生。
- 当前 Windows 打包模式把 `config.json` 与默认项目目录置于可执行文件附近，不能满足独立数据目录要求，需要改为新产品专属 `userData`，且不读取旧目录。

### 实现三：主渲染器产品版型适配

- `app/renderer/src/main/src/utils/envfile.tsx` 的 `getReleaseEditionName` 与 `GetMainColor` 是主渲染器的产品名和主色适配点。
- `app/renderer/src/main/src/NewApp.tsx` 使用版型名称更新页面标题。
- `app/renderer/src/main/src/pages/softwareSettings/SoftwareSettings.tsx` 和 `app/renderer/src/main/src/components/layout/FuncDomain.tsx` 包含用户可见产品标志。
- 可复用模式是“版型函数承载兼容判断，界面只读取函数结果”。默认社区版名称与颜色可取自产品配置，现有版型枚举值和更新源标识保持原状。

### 实现四：引擎启动渲染器产品版型适配

- `app/renderer/engine-link-startup/src/utils/envfile.tsx` 与主渲染器具有同构的版型名称和颜色函数。
- `app/renderer/engine-link-startup/src/App.tsx` 更新页面标题并维持原有启动通信。
- `app/renderer/engine-link-startup/src/pages/StartupPage/index.tsx` 选择启动标志和右侧静态资源。
- 可复用模式是“默认社区版资源与其他版型资源分支隔离”。本阶段只替换默认产品资源，不改变引擎启动、端口和通信协议。

### 实现五：测试组织与断言方式

- `app/main/__test__/toolsFunc.test.js` 使用 Vitest 的 `describe`、`it` 与 `expect` 验证纯函数。
- `app/renderer/engine-link-startup/src/pages/StartupPage/__test__/utils.test.ts` 在模块载入前使用 `vi.mock` 隔离桌面桥。
- `app/renderer/src/main/src/pages/robotControl/__test__/status.test.ts` 覆盖正常状态、退化状态与错误状态。
- 新测试应优先覆盖纯配置校验、平台可执行文件选择、独立数据路径和构建元数据，桌面界面行为由实际应用验证承担。

## 三、项目约定

- 代码标识符使用英文，组件与类型使用大驼峰，函数与变量使用小驼峰。
- JavaScript 与 TypeScript 采用两空格缩进、单引号、无分号、行宽一百二十字符、文件末尾换行。
- 测试文件位于被测模块附近的 `__test__` 目录，文件名使用 `*.test.js`、`*.test.ts` 或 `*.test.tsx`。
- Electron 行为位于 `app/main`，主界面位于主渲染器，启动界面位于引擎启动渲染器。
- 文件变更限定为用户授权目录，不触及业务核心与工作流文件。

## 四、可复用组件清单

- `app/main/filePath.js`：数据、日志、引擎和项目目录派生。
- `app/main/logFile.js`：日志目录初始化和系统打开行为。
- `app/main/index.js`：窗口显示、隐藏、关闭和应用退出流程。
- `app/main/menu.js`：系统菜单模板。
- `app/renderer/src/main/src/utils/envfile.tsx`：主渲染器版型适配。
- `app/renderer/engine-link-startup/src/utils/envfile.tsx`：启动渲染器版型适配。
- `packageScript/buildHook/before-pack.js`：跨平台产物命名和载荷装配。

## 五、依赖与集成关系

| 输入 | 适配位置 | 输出或使用方 |
| --- | --- | --- |
| `product/renyan.json` | `app/main/product.js` | 应用名称、窗口标题、专属数据目录、菜单、托盘、关于信息 |
| `product/renyan.json` | 主渲染器产品适配模块 | 页面标题、默认版型名称、产品主色、用户可见标志 |
| `product/renyan.json` | 启动渲染器产品适配模块 | 页面标题、默认版型名称、产品主色、启动标志 |
| `product/renyan.json` | Electron Builder 配置与构建钩子 | 应用标识、可执行文件、快捷方式、桌面项、安装包名称 |
| 品牌生成脚本 | `product/brand`、`app/assets` 与两套渲染资源目录 | SVG、PNG、ICO、ICNS、启动静态资源 |
| 根包版本与构建注入信息 | 关于模块 | 客户端版本、构建提交标识、版型 |
| `bins/engine-version.txt` | 关于模块 | 内置引擎版本；文件缺失时明确显示不可用 |
| 根许可证与产品第三方通知索引 | 构建资源与关于模块 | 本地许可证入口和第三方通知入口 |

主进程对两套渲染器的现有通信通道不变。关于窗口由主进程创建并直接读取本地构建信息，不增加通信通道。

## 六、官方资料与开源检索

- Electron Builder 公共配置：`https://www.electron.build/docs/configuration/`，用于确认 `appId`、`executableName`、`artifactName`、`extraMetadata` 与资源复制字段。
- Electron Builder Windows 安装配置：`https://www.electron.build/nsis/`，用于确认 `shortcutName`。
- Electron Builder Linux 配置：`https://www.electron.build/docs/linux/`，用于确认桌面项 `Name`、可执行文件和图标目录格式。
- Electron Builder macOS 配置：`https://www.electron.build/mac/`，用于确认 `extendInfo` 可写入 `CFBundleDisplayName`。
- GitHub 代码检索在 `electron-userland/electron-builder` 和 `electron/electron` 中定位到打包字段变更记录、应用路径文档与测试实现；检索没有发现适合直接移植的托盘样例，因此托盘采用 Electron 标准对象与现有窗口函数组合。

`context7`、`sequential-thinking`、`shrimp-task-manager` 与 `desktop-commander` 在当前会话不可用。替代方式分别为官方文档、结构化上下文摘要与计划工具、计划工具、CodeGraph 加限定范围的仓库命令。工具缺失不改变验收要求。

## 七、技术选择

- 单一配置采用只含数据的 JSON，主进程、两套构建工具和两套渲染器均可读取，避免语言模块格式冲突。
- 每个消费端保留很薄的适配模块，只负责类型、冻结和平台选择，不复制产品字段。
- 不增加通信通道；关于信息由主进程本地读取，托盘通过传入窗口操作函数工作。
- 品牌资源由受控脚本从同一几何定义和产品颜色生成。Python 环境已有 Pillow 12.1.1，可生成 PNG、ICO 与 ICNS；CairoSVG 因系统缺少 Cairo 动态库不可用，因此不作为依赖。
- 默认数据根目录使用 `appData/defaultDataDirectory`，默认项目数据位于该根目录下。旧 `Yakit` 数据目录不扫描、不复制、不迁移；显式环境变量仍视为使用者主动配置。

## 八、风险与限制

- 三组依赖目录当前均不存在，需要按仓库既有安装命令获取依赖后才能完成全部验证。
- `bins/engine-version.txt`、`bins/yak_windows_amd64.zip` 与浏览器扩展压缩包当前缺失。Windows 安装包验证需要依据仓库既有下载流程准备这些忽略文件，不提交它们。
- ICNS 可以在 Windows 上生成并做容器与尺寸校验，但真实 macOS 图标显示和签名兼容性只能记录为待对应平台验证。
- 应用标识与发布证书尚未联合验证；源文件和构建产物可验证，签名身份不能在本机推定。
- `getReleaseEditionName` 影响面较大，只改默认社区版返回值，其他版型分支和内部版型枚举保持不变。

## 九、充分性检查

- [x] 接口契约明确：产品配置字段、平台可执行文件选择、窗口与构建消费点均已定位。
- [x] 技术选择明确：通用 JSON 加消费端适配，不增加协议与通信通道。
- [x] 主要风险明确：依赖缺失、打包载荷缺失、跨平台图标验证和签名材料缺失。
- [x] 验证方式明确：纯函数测试、配置读取、资源格式检查、静态检查、两套渲染构建、Windows 无签名打包和桌面界面检查。
- [x] 已分析至少三个相似实现：构建变体、主进程生命周期与路径、主渲染器版型、启动渲染器版型、现有测试。
- [x] 已识别复用项：路径、日志、窗口操作、版型函数、构建钩子和测试框架。
- [x] 已排除重复功能：仓库没有托盘模块、关于页面或集中产品配置目录。

## 十、验收标准

1. 单一产品配置包含用户指定字段，并由主进程、两套渲染器和构建配置实际引用。
2. Windows、macOS 与 Linux 构建配置具有明确的名称、应用标识、可执行文件、产物名称和平台元数据。
3. 默认数据目录与旧产品目录隔离，测试证明路径由新配置产生。
4. 托盘具有五项指定操作，系统菜单与关于窗口可用。
5. 关于窗口展示产品名、客户端版本、引擎版本、构建提交标识、版型及两个法律入口。
6. 新品牌资源为原创几何设计，打包图标不再引用旧品牌文件，PNG、ICO 与 ICNS 均通过格式检查。
7. 用户指定的本地命令全部执行，任何失败均记录原因与处理结果，不把未执行项目写成成功。
8. 有界关键字检查完成并写入 `docs/renyan/KNOWN_ISSUES.md`。
9. 变更只在 `qsh` 提交并推送至 `origin/qsh`，不触及 `master` 或上游。
