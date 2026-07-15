# 项目上下文摘要（睿眼多平台安装包工作流）

生成时间：2026-07-15 11:53:27 +08:00

## 一、相似实现分析

- `.github/workflows/multi-platform-build.yml`：现有网页手动运行入口，已经包含平台、类别、引擎、签名、依赖安装、渲染器构建、打包与产物上传，但所有平台集中在一个苹果系统任务内，并含旧产品类别和免许可证入口。本任务保留文件路径，替换输入契约与任务编排。
- `.github/workflows/build-multi-prod.yml`：正式多产品工作流提供引擎下载、苹果证书导入、产物上传和微软系统签名动作的既有模式。可复用签名动作与密钥名称，不复用多产品矩阵和跨平台集中打包。
- `.github/workflows/verify-yakit-sign-build.yml`：签名验证工作流提供苹果账号、公证变量与签名打包流程。可复用证书导入及公证入口，不复用运行时增加依赖和旧品牌产物名称。
- `packageScript/buildHook/before-pack.js`：打包前按平台与架构选择引擎压缩包并设置产物文件名。现有实现强制要求预置引擎，本任务需以显式环境变量区分预置和非预置路径，并保持未采用新环境变量的既有脚本行为。
- `buildHooks/before_pack.js`：上游旧打包钩子展示平台、架构、额外文件与文件名的基础映射，可用于确认现有约定，但不作为修改目标。

## 二、项目约定

- 命名约定：组件与类型采用大驼峰，函数与变量采用小驼峰，脚本文件采用短横线名称，工作流任务采用短横线标识。
- 文件组织：工作流位于 `.github/workflows`，打包配置和辅助程序位于 `packageScript`，集中产品身份位于 `product/renyan.json`，交付说明位于 `docs/renyan`。
- 代码风格：文本采用 UTF-8 无字节顺序标记、换行符为换行、两空格缩进、单引号、无分号和尾逗号。
- 分支约束：唯一工作分支为 `qsh`，唯一推送目标为 `origin/qsh`，禁止修改或推送 `master`。

## 三、可复用组件清单

- `product/renyan.json`：提供产品名称、短名称、应用标识、可执行文件名、图标与安装文件品牌前缀。
- `product/build.js`：提供构建提交标识和类别解析；`PLATFORM=yakitEE` 对应企业版。
- `packageScript/electron-builder.config.js`：提供三个平台的目标、图标、输出目录、打包钩子和苹果公证挂载条件。
- `packageScript/buildHook/before-pack.js`：提供目标平台的引擎压缩包映射与产物命名入口。
- `.github/actions/sign-windows/action.yml`：提供微软系统安装文件的现有密钥库签名和签名状态检查。
- `app/renderer/src/main/.env-cmdrc`：普通企业版只设置企业类别；只有独立的免许可证环境才关闭许可证要求，因此 `yarn build-renders-enterprise` 保留原许可证校验。
- `product/engine-compatibility.json`：提供当前客户端的推荐引擎版本以及平台、架构和内部文件名映射。

## 四、测试策略

- 测试框架为 Vitest，采用相邻 `__test__` 目录、中文用例名称和显式断言。
- `app/main/__test__/product.test.js` 验证产品配置、构建类别、打包图标与引擎兼容清单。
- `app/main/__test__/engineLifecycle.test.js` 验证摘要比较、下载失败、摘要不一致和压缩包提取边界。
- 本任务增加针对跨平台辅助程序和工作流契约的定向测试，不执行全量测试、全量规则检查、全量类型检查、浏览器测试或本机苹果安装文件构建。
- 最低验证包括工作流语法解析、输入引用一致性、脚本存在性、任务条件、执行环境、类别映射、许可证约束、产物名称、密钥不回显、`git diff --check` 和工作区状态。

## 五、依赖与集成点

- 外部依赖：`actions/checkout@v4`、`actions/setup-node@v4`、`actions/upload-artifact@v4`、`electron-builder@26.15.3`、`adm-zip@0.5.16`、`AzureSignTool@7.0.1`。
- 内部依赖：工作流调用根目录构建命令和新增睿眼打包命令；打包命令读取 `.env-cmdrc`；打包器调用 `before-pack.js`；辅助程序读取产品配置、根版本和引擎兼容清单。
- 输入协议：`target`、`edition`、`include_engine`、`engine_version`、`sign_installers`、`retention_days`。
- 输出协议：每个被选任务生成一个安装文件、`release/build-manifest.json` 和 `release/SHA256SUMS.txt`，再由独立产物容器上传。
- 配置来源：应用版本只读根 `package.json`；品牌前缀只读 `product/renyan.json`；推荐引擎版本只读 `product/engine-compatibility.json`。

## 六、技术选型理由

- 四个显式任务对应四类原生执行环境，满足网页选择与平台隔离要求，避免跨系统模拟层。
- 引擎准备与构建元数据采用小型跨平台程序，消除四个任务中的命令解释器差异，并集中版本校验、摘要校验、清单字段与文件名检查。
- 新增睿眼专用打包环境和命令，不改写既有多产品命令；打包钩子仅在专用环境变量存在时采用新的类别文件名。
- 无签名和签名命令分离。默认路径不引用签名密钥；苹果系统签名任务与微软系统签名任务只在用户明确选择时读取各自密钥。

## 七、关键风险点

- 引擎远端摘要文件的具体文本格式可能包含文件名，解析器需只接受唯一的六十四位十六进制摘要。
- 苹果签名需同时具备账号、公证、团队和证书五项密钥；缺少任何一项必须失败。
- 微软系统签名依赖既有密钥库动作；签名工具版本需固定，避免运行时选择未知版本。
- `include_engine=false` 必须阻止下载、摘要获取、签名和引擎文件打包，同时不能改变既有非工作流打包命令的默认行为。
- Linux 当前没有安装文件签名机制；用户选择签名时应明确失败，不能把无签名文件标记为签名文件。
- 当前环境不执行远端工作流和苹果安装文件构建，动态产物结果保留为远端首次运行验证项。

## 八、外部资料来源与用途

- `https://docs.github.com/en/actions/reference/runners/github-hosted-runners`：确认 `macos-15-intel` 为英特尔架构，`macos-15` 为苹果芯片架构，`windows-2022` 与 `ubuntu-22.04` 为六十四位执行环境。
- `https://www.electron.build/docs/cli/`：确认平台参数与 `--x64`、`--arm64` 架构参数；本地 `electron-builder@26.15.3 --help` 给出相同能力。
- `https://www.nuget.org/packages/AzureSignTool/`：确认固定签名工具版本 `7.0.1`。

## 九、充分性检查

- 已能定义输入、输出、参数约束、失败条件与文件命名契约。
- 已理解原生执行环境、类别环境、许可证变量、打包钩子和签名动作的选择理由。
- 已识别引擎摘要、签名密钥、动态依赖、文件名、未签名误标和跨平台解释器差异。
- 已确定定向测试、结构检查、差异检查与禁止项检索方式。
- 已检查三个相似工作流、两个打包钩子、集中产品配置、类别环境与相邻测试，不建立重复产品配置或第二个同功能工作流。
