# 睿眼多平台安装文件构建说明

## 一、工作流范围

工作流文件为 `.github/workflows/multi-platform-build.yml`，页面名称为 `RuiYan Multi-Platform Package`。工作流只允许从 `qsh` 分支构建社区版或企业版客户端，不包含轻量企业版、代码审计版、代码审计企业版和智能代理版。

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
8. 设置 `edition`，值只能为 `community` 或 `enterprise`。
9. 设置 `include_engine`。
10. 启用预置引擎且需要指定版本时填写 `engine_version`。
11. 首次验证保持 `sign_installers=false`。
12. 设置 `retention_days`，值只能为 `7`、`14` 或 `30`。
13. 点击 `Run workflow`。
14. 等待被选任务完成。
15. 打开对应的工作流运行记录。
16. 在 `Artifacts` 区域下载安装文件产物。

工作流内的分支检查会拒绝任何非 `qsh` 的运行。应用版本只读取根目录 `package.json`，网页没有独立版本输入。

## 三、输入参数

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `target` | 选择 | `macos-both` | 选择一个平台、两个苹果系统架构或全部平台 |
| `edition` | 选择 | `community` | 选择社区版或企业版 |
| `include_engine` | 布尔 | `false` | 是否预置目标平台和架构的 Yak 引擎 |
| `engine_version` | 字符串 | 空 | 启用预置引擎时指定版本；空值读取兼容清单推荐版本 |
| `sign_installers` | 布尔 | `false` | 是否启用已经配置的安装文件签名与苹果系统公证 |
| `retention_days` | 选择 | `14` | 产物容器保留天数 |

社区版调用 `yarn build-renders`，企业版调用 `yarn build-renders-enterprise`。企业版构建保留原有许可证校验和企业登录机制，页面没有免许可证参数，工作流也不调用任何免许可证构建命令。

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

企业版首次验证将 `edition` 改为 `enterprise`，其余字段保持相同。企业版许可证校验继续启用，不存在可选择的跳过方式。

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

这些命令会创建远端工作流运行。当前改造过程没有执行上述命令，也没有自动创建发布、标签或合并请求。

## 六、预置引擎

关闭 `include_engine` 时，任务不访问引擎文件或摘要文件，不签名引擎，也不把引擎版本文件加入安装文件。应用继续采用现有的引擎安装或下载流程。

开启 `include_engine` 时，工作流执行以下约束：

1. 从 `engine_version` 或 `product/engine-compatibility.json` 确定版本。
2. 只接受字母、数字、点、横杠和下划线，拒绝 `latest` 和其他不明确值。
3. 按任务选择 `yak_darwin_amd64`、`yak_darwin_arm64`、`yak_windows_amd64.exe` 或 `yak_linux_amd64`。
4. 通过固定的 HTTPS 地址分别下载引擎与摘要文件。
5. 在归档前比较真实文件摘要，摘要不一致时终止任务。
6. 保持压缩包内部的既有引擎文件名，并按打包钩子规则放入安装文件。
7. 在 `build-manifest.json` 中记录最终版本。

项目当前推荐引擎版本为 `1.4.8-beta3`。该版本四个目标工件的摘要地址已取得有效响应；工作流仍会在每次启用预置引擎时重新下载并验证摘要。

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

缺少必要凭据时，对应任务明确失败。当前仓库没有开源系统安装文件签名机制，因此开源系统任务会拒绝 `sign_installers=true`，不会把无签名文件标记为签名文件。

## 八、安装文件与产物容器

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
```

产物容器采用以下规则：

```text
RuiYan-Community-macOS-x64-unsigned
RuiYan-Community-macOS-arm64-unsigned
RuiYan-Community-Windows-x64-unsigned
RuiYan-Community-Linux-x64-unsigned
RuiYan-Enterprise-macOS-x64-unsigned
RuiYan-Enterprise-macOS-arm64-unsigned
RuiYan-Enterprise-Windows-x64-unsigned
RuiYan-Enterprise-Linux-x64-unsigned
```

签名任务将末尾的 `unsigned` 改为 `signed`。每个容器只包含安装文件、`build-manifest.json` 和 `SHA256SUMS.txt`。摘要文件记录真实安装文件名和非空摘要，不包含依赖目录、解包目录、证书、密钥或环境变量文件。

## 九、页面仍显示旧输入

页面仍显示 `Select version type`、`ce`、`ee`、`se`、`irify`、`memfit`、`Legacy system version` 或跳过许可证选项时，检查 `Use workflow from` 是否为 `qsh`。选择 `master` 时，页面可能载入旧工作流定义。

将 `Use workflow from` 改为 `qsh` 后刷新页面。页面没有载入 `qsh` 输入时，可以采用第五节命令，并保留 `--ref qsh`。不要修改 `master` 来改变页面定义。

## 十、图片与扩展文件

安装配置已引用 `app/assets/renyan-icon.icns`、`app/assets/renyan-icon.ico` 和 `product/brand/icons`。这些文件存在且可读取，全尺寸图标已经完成视觉检查，用户无需上传图片。

`bins/scripts/google-chrome-plugin.zip` 已存在，并由既有打包配置加入安装文件。工作流不再访问旧版非加密扩展版本地址，也不在运行期间下载扩展。
