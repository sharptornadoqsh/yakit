# 项目上下文摘要（Linux 安装文件架构冲突）

生成时间：2026-07-16 08:31:44 +08:00

## 一、任务边界

- 工作分支为 `qsh`，开始时工作树无改动，CodeGraph 索引有效。
- 修复 GitHub Actions 任务 `29457787711` 中 `RuiYan Linux x64 Package` 的架构冲突，使 Linux x64 任务只生成一个 x64 AppImage。
- 根据用户追加要求增加独立的 `linux-arm64` 选择，使两个 Linux 架构分别由原生执行环境生成对应 AppImage。
- 同一配置也影响苹果系统任务，因此回归契约同时限制苹果系统任务不得由单架构命令触发第二种架构。
- 复用既有引擎下载、摘要校验、签名、渲染器构建、认证、许可证和上传协议，仅增加 arm64 映射。

## 二、相似实现分析

### 二点一、平台打包命令

- 文件：`package.json`。
- 模式：睿眼平台命令使用 `--mac --x64`、`--mac --arm64`、`--linux --x64` 和 `--win --x64` 明确声明单一架构。
- 可复用：增加与现有 Linux 命令同形的 `--linux --arm64` 命令，不增加包装程序或新的环境配置。

### 二点二、平台目标配置

- 文件：`packageScript/electron-builder.config.js`。
- 模式：苹果系统和 Linux 目标在配置中分别写入 `arch: ['x64', 'arm64']`，这会声明两个构建架构；微软系统目标只声明 `x64`。
- 风险：显式多架构目标覆盖单架构命令的意图，使同一任务依次构建两种架构。

### 二点三、打包前钩子

- 文件：`packageScript/buildHook/before-pack.js`。
- 模式：`resolveBuildArchitecture` 优先使用任务环境中的 `RENYAN_PACKAGE_ARCHITECTURE`，并用该值选择引擎和文件名。
- 风险：当构建器触发第二种架构时，钩子仍使用任务声明的第一种架构，导致两种二进制共用同一文件名。

### 二点四、多平台工作流与元数据

- 文件：`.github/workflows/multi-platform-build.yml` 与 `packageScript/script/create-renyan-build-metadata.js`。
- 模式：现有任务各自固定目标架构，元数据程序只接受并上传一个精确文件名。
- 可复用：Linux arm64 采用第五个独立任务、独立目标定义、精确文件名和单文件上传契约。

### 二点五、引擎兼容条目

- 文件：`product/engine-compatibility.json` 与 `packageScript/script/prepare-renyan-engine.js`。
- 模式：兼容清单已经声明 `yak_linux_arm64`，准备程序尚未接受该工件。
- 可复用：把既有兼容条目接入准备程序；推荐版本的引擎文件与摘要地址均返回状态二百。

## 三、关键证据

- 远端任务：`https://github.com/sharptornadoqsh/yakit/actions/runs/29457787711`。
- Linux x64 任务先构建 `arch=x64`，随后额外构建 `arch=arm64`；两次均使用 `RuiYan-Pentest-Enterprise-No-License-1.4.8-0711-linux-x64.AppImage`，第二次产生文件不存在错误。
- 苹果系统 x64 任务也依次构建 x64 与 arm64，并都使用 `darwin-x64.dmg`；苹果系统 arm64 任务以相反次序构建，并都使用 `darwin-arm64.dmg`。任务虽成功，但最终文件架构存在被后一次构建替换的风险。
- 官方命令行文档说明，架构可以由 `--x64` 或 `--arm64` 指定；目标配置中的 `arch` 列表用于显式多架构构建。来源：`https://www.electron.build/docs/cli/` 与 `https://www.electron.build/docs/architecture/`。

## 四、项目约定

- JavaScript 使用两个空格、单引号、无分号和尾随逗号。
- 打包契约测试位于 `app/main/__test__/renyanPackaging.test.js`，使用 Vitest、文件读取、模块导入与精确断言。
- 平台产物由命令行架构参数决定，配置只声明产物类型，不重复声明架构集合。
- 用户可见文本与本地记录使用简体中文，代码标识符保持项目既有英文命名。

## 五、测试策略

- 先增加配置契约断言，证明当前苹果系统与 Linux 目标包含多架构列表并使测试失败。
- 将苹果系统与 Linux 目标改为只声明产物类型，再验证配置契约通过。
- 检查全部睿眼单架构命令仍包含对应的 `--x64` 或 `--arm64` 参数。
- 执行打包定向测试、配置语法检查、工作流解析、格式检查、差异空白检查与 CodeGraph 同步。
- 当前主机是微软系统，不能把本地 AppImage 生成标记为动态通过；本地契约验证完成后由新提交分别验证两个 Linux 托管任务的真实产物。

## 六、依赖与集成点

```text
GitHub Actions 单架构任务（Linux x64 或 Linux arm64）
  → package.json 单架构命令
  → electron-builder 平台目标类型
  → beforePack 架构、引擎与文件名
  → create-renyan-build-metadata 精确文件
  → upload-artifact 单文件上传
```

## 七、上下文充分性检查

- 接口契约明确：每个任务输入一个平台与一个架构，输出一个对应安装文件。
- 技术选择明确：架构由既有命令行参数决定，平台配置只保留目标类型。
- 风险已经识别：Linux 文件不存在、苹果系统文件架构误标、arm64 执行环境可用性和跨平台动态验证限制。
- 验证方式明确：失败回归、定向测试、配置解析、命令契约、格式与远端新任务。
