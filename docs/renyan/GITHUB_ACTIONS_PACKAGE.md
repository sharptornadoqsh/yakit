# 睿眼多平台安装文件构建说明

## 一、工作流范围

工作流文件为 `.github/workflows/multi-platform-build.yml`，页面名称为 `RuiYan Multi-Platform Package`。工作流只允许从 `qsh` 分支构建社区版、企业版或企业版免许可证客户端，不包含轻量企业版、代码审计版、代码审计企业版和智能代理版。

四类安装文件分别在原生执行环境中生成：

| 目标 | 安装文件 | 执行环境 | 超时 |
| --- | --- | --- | ---: |
| `macos-x64` | 英特尔架构苹果系统安装文件 | `macos-15-intel` | 九十分钟 |
| `macos-arm64` | 苹果芯片架构苹果系统安装文件 | `macos-15` | 九十分钟 |
| `windows-x64` | 六十四位微软系统安装文件 | `windows-2022` | 六十分钟 |
| `linux-x64` | 六十四位开源系统安装文件 | `ubuntu-22.04` | 六十分钟 |

`macos-both` 同时执行两个苹果系统任务，`all` 同时执行全部四个任务。本阶段不提供微软系统或开源系统的苹果芯片架构构建。

## 二、网页运行步骤

1. 打开 GitHub 仓库。
2. 进入 `Actions` 页面。
3. 选择 `RuiYan Multi-Platform Package`。
4. 点击 `Run workflow`。
5. 在 `Use workflow from` 中选择 `qsh`。
6. 不选择 `master`。
7. 设置 `target`。
8. 设置 `edition`，值只能为 `community`、`enterprise` 或 `enterprise-no-license`。
9. 设置 `include_engine`。
10. 启用预置引擎且需要指定版本时填写 `engine_version`。
11. 首次验证保持 `sign_installers=false`。
12. 设置 `retention_days`，值只能为 `7`、`14` 或 `30`。
13. 点击 `Run workflow`。
14. 等待被选任务完成。
15. 打开对应的工作流运行记录。
16. 在 `Artifacts` 区域点击安装文件名，直接下载 `.exe`、`.dmg` 或 `.AppImage`。

工作流内的分支检查会拒绝任何非 `qsh` 的运行。应用版本只读取根目录 `package.json`，网页没有独立版本输入。

## 三、输入参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `target` | 选择 | `macos-both` | 选择一个平台、两个苹果系统架构或全部平台 |
| `edition` | 选择 | `community` | 选择社区版、企业版或企业版免许可证 |
| `include_engine` | 布尔 | `false` | 是否预置目标平台和架构的 Yak 引擎 |
| `engine_version` | 字符串 | 空 | 启用预置引擎时指定版本；空值读取兼容清单推荐版本 |
| `sign_installers` | 布尔 | `false` | 是否启用已经配置的安装文件签名与苹果系统公证 |
| `retention_days` | 选择 | `14` | 直接安装文件保留天数 |

社区版调用 `yarn build-renders`，企业版调用 `yarn build-renders-enterprise`，企业版免许可证调用 `yarn build-renders-enterprise-no-license`。普通企业版保留原有许可证校验和企业登录机制；免许可证类别只复用仓库已有构建变量，不修改许可证判断源码。

## 四、首次验证参数

社区版首次验证采用以下参数：

| 字段 | 值 |
| --- | --- |
| `Use workflow from` | `qsh` |
| `target` | `macos-both` |
| `edition` | `community` |
| `include_engine` | `false` |
| `engine_version` | 空 |
| `sign_installers` | `false` |
| `retention_days` | `14` |

企业版首次验证将 `edition` 改为 `enterprise`，其余字段保持相同。免许可证企业版将 `edition` 改为 `enterprise-no-license`。未配置签名凭据时，两种类别均保持 `sign_installers=false`。

## 五、命令行运行

社区版苹果系统双架构命令：

```bash
gh workflow run multi-platform-build.yml \
  --repo sharptornadoqsh/yakit \
  --ref qsh \
  -f target=macos-both \
  -f edition=community \
  -f include_engine=false \
  -f engine_version="" \
  -f sign_installers=false \
  -f retention_days=14
```

企业版苹果系统双架构命令：

```bash
gh workflow run multi-platform-build.yml \
  --repo sharptornadoqsh/yakit \
  --ref qsh \
  -f target=macos-both \
  -f edition=enterprise \
  -f include_engine=false \
  -f engine_version="" \
  -f sign_installers=false \
  -f retention_days=14
```

企业版免许可证苹果系统双架构命令：

```bash
gh workflow run multi-platform-build.yml \
  --repo sharptornadoqsh/yakit \
  --ref qsh \
  -f target=macos-both \
  -f edition=enterprise-no-license \
  -f include_engine=false \
  -f engine_version="" \
  -f sign_installers=false \
  -f retention_days=14
```

这些命令会创建远端工作流运行。当前改造过程没有执行上述命令，也没有自动创建发布、标签或合并请求。

## 六、预置引擎

关闭 `include_engine` 时，任务不访问引擎文件或摘要文件，不签名引擎，也不把引擎版本文件加入安装文件。应用继续采用现有的引擎安装或下载流程。

复查任务日志时，以任务步骤的 `INCLUDE_ENGINE` 环境值为准。任务 `29396021957` 的四个平台均记录为 `true`，因此该次任务确实启用了预置引擎；网页表单当前未勾选只影响下一次创建的任务。未勾选后，新任务应记录 `INCLUDE_ENGINE: false`，引擎准备步骤应显示为跳过。

开启 `include_engine` 时，工作流执行以下约束：

1. 从 `engine_version` 或 `product/engine-compatibility.json` 确定版本。
2. 只接受字母、数字、点、横杠和下划线，拒绝 `latest` 和其他不明确值。
3. 按任务选择 `yak_darwin_amd64`、`yak_darwin_arm64`、`yak_windows_amd64.exe` 或 `yak_linux_amd64`。
4. 通过固定的 HTTPS 地址分别下载引擎与摘要文件。
5. 在归档前比较真实文件摘要，摘要不一致时终止任务。
6. 保持压缩包内部的既有引擎文件名，并按打包钩子规则放入安装文件。
7. 在 `build-manifest.json` 中记录最终版本。

项目当前推荐引擎版本为 `1.4.8-beta3`。该版本四个目标工件的摘要地址已取得有效响应；工作流仍会在每次启用预置引擎时重新下载并验证摘要。

每个原生任务还会显式声明安装文件目标架构。打包钩子优先使用该声明选择兼容清单工件，避免苹果臂架构误取英特尔压缩包，或开源系统英特尔架构误取臂架构压缩包。直接在本地调用打包命令时，钩子继续使用打包器传入的架构编号。

## 七、签名

默认的 `sign_installers=false` 不读取签名凭据。苹果系统采用 `CSC_IDENTITY_AUTO_DISCOVERY=false`，不挂载公证钩子；微软系统不调用签名动作；开源系统生成无签名安装文件。

苹果系统签名需要以下仓库密钥：

- `APPLE_ACCOUNT_EMAIL`
- `APPLE_APP_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`

微软系统签名需要以下仓库密钥：

- `AZURE_YAK_CODE_SIGN_KEY_VAULT_URI`
- `AZURE_YAK_CODE_SIGN_KEY_VAULT_APPLICATION_ID`
- `AZURE_YAK_CODE_SIGN_KEY_VAULT_DIRECTORY_ID`
- `AZURE_YAK_CODE_SIGN_KEY_VAULT_CLIENT_SECRET`
- `AZURE_YAK_CODE_SIGN_KEY_VAULT_CERT_NAME`
- `AZURE_YAK_CODE_SIGN_KEY_VAULT_TIMESTAMP_URL`

缺少必要凭据时，对应任务明确失败。错误列出全部微软签名输入时，表示选择了 `sign_installers=true`，但上述六项仓库密钥为空；无需签名时重新选择 `false`。当前仓库没有开源系统安装文件签名机制，因此开源系统任务会拒绝 `sign_installers=true`，不会把无签名文件标记为签名文件。

## 八、安装文件与直接下载

安装文件名称由 `product/renyan.json` 中的 `artifactPrefix` 与根版本共同生成：

```text
RuiYan-Pentest-Community-<version>-darwin-x64.dmg
RuiYan-Pentest-Community-<version>-darwin-arm64.dmg
RuiYan-Pentest-Community-<version>-windows-x64.exe
RuiYan-Pentest-Community-<version>-linux-x64.AppImage
RuiYan-Pentest-Enterprise-<version>-darwin-x64.dmg
RuiYan-Pentest-Enterprise-<version>-darwin-arm64.dmg
RuiYan-Pentest-Enterprise-<version>-windows-x64.exe
RuiYan-Pentest-Enterprise-<version>-linux-x64.AppImage
RuiYan-Pentest-Enterprise-No-License-<version>-darwin-x64.dmg
RuiYan-Pentest-Enterprise-No-License-<version>-darwin-arm64.dmg
RuiYan-Pentest-Enterprise-No-License-<version>-windows-x64.exe
RuiYan-Pentest-Enterprise-No-License-<version>-linux-x64.AppImage
```

每个任务只上传一个安装文件，并设置 `archive: false`。Actions 页面使用真实安装文件名作为产物名，点击后直接返回该文件，不再生成外层 ZIP。构建清单和摘要仍在任务工作目录生成，但不作为单独下载项上传。

## 九、页面仍显示旧输入

页面仍显示 `Select version type`、`ce`、`ee`、`se`、`irify`、`memfit` 或 `Legacy system version` 时，检查 `Use workflow from` 是否为 `qsh`。选择 `master` 时，页面会载入旧工作流定义；任务名称为 `Multi-Platform Build Develop` 且分支显示 `master` 也属于旧定义。

将 `Use workflow from` 改为 `qsh` 后刷新页面。页面没有载入 `qsh` 输入时，可以采用第五节命令，并保留 `--ref qsh`。不要修改 `master` 来改变页面定义。

## 十、Action 运行时

`qsh` 工作流使用 `actions/checkout@v7`、`actions/setup-node@v6` 和 `actions/upload-artifact@v7`，三者均采用 Node.js 24。`upload-artifact@v7` 的非归档模式只接受一个文件，因此四个原生任务分别上传对应架构的单个安装文件。旧工作流中的 v4 与第三方 Action 可能显示 Node.js 20 弃用警告；该警告不同于签名凭据缺失错误。

任务 `29396021957` 中，微软系统任务完成，苹果臂架构与开源系统任务在打包钩子中分别选错引擎架构，苹果英特尔任务随后被取消。该问题已经通过固定任务架构声明修正。该任务的 `sign_installers` 为 `false`，所以开源系统日志中的失败不属于签名故障。

旧提交 `b812e3b` 的安装文件没有包含 `product/build.js`，启动时会在主进程报告模块缺失。使用修复后的 `qsh` 提交重新构建即可，旧安装文件不应继续发布。

在源码目录使用生产资源启动时，必须先生成与类别对应的两个渲染器。企业版的本地检查顺序如下：

```powershell
yarn build-renders-enterprise
$env:ELECTRON_IS_DEV = '0'
yarn start-electron
```

`ELECTRON_IS_DEV=0` 不会代替渲染器构建。缺少 `app/renderer/pages/main/index.html` 时，Electron 会报告 `ERR_FILE_NOT_FOUND` 并显示空白窗口。源码生产模式现在会从仓库根目录解析 `bins`，已安装程序仍从安装资源目录解析。

## 十一、图片与扩展文件

安装配置已引用 `app/assets/renyan-icon.icns`、`app/assets/renyan-icon.ico` 和 `product/brand/icons`。这些文件存在且可读取，全尺寸图标已经完成视觉检查，用户无需上传图片。

`bins/scripts/google-chrome-plugin.zip` 不受版本控制，因此托管任务会在打包前从固定的 HTTPS 地址下载 `0.0.7` 版本，并校验 SHA256 `5b250638ce76c95e9bc2c25db48049eac1f7af25fe34187e2b0997b872811f6d`。下载失败或摘要不一致会明确终止任务；工作流不读取动态最新版，也不访问非加密版本地址。
