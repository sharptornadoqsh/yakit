# 睿眼多平台安装文件工作流移交

## 一、交付结论

`.github/workflows/multi-platform-build.yml` 已改造为 `RuiYan Multi-Platform Package`。网页输入只保留目标平台、社区版、企业版或企业版免许可证、是否预置引擎、引擎版本、是否签名和产物保留天数。四个平台分别在原生执行环境中构建，每个被选任务只上传对应的一个安装文件，网页下载不再封装为 ZIP。

默认路径生成无签名内部验证安装文件，不读取签名凭据。企业版调用 `yarn build-renders-enterprise` 并保留现有许可证校验；企业版免许可证调用仓库既有 `yarn build-renders-enterprise-no-license`，两类安装文件使用不同名称。

前端可见英文短名称、可执行文件名与用户数据目录统一为 `RuiYan-Pentest`。Linux 可执行文件名使用 `ruiyan-pentest`；内部代码符号、应用标识和资源路径保留既有兼容名称。

## 二、最终输入

| 参数 | 默认值 | 可选值或约束 |
| --- | --- | --- |
| `target` | `macos-both` | `macos-x64`、`macos-arm64`、`macos-both`、`windows-x64`、`linux-x64`、`all` |
| `edition` | `community` | `community`、`enterprise`、`enterprise-no-license` |
| `include_engine` | `false` | 布尔值 |
| `engine_version` | 空 | 仅允许版本所需字符，空值读取兼容清单 |
| `sign_installers` | `false` | 布尔值 |
| `retention_days` | `14` | `7`、`14`、`30` |

已移除旧的 `platform`、`legacy`、`version`、`noBuiltInYakVersion`、`devTool` 和 `sign` 输入。轻量企业版、代码审计版、代码审计企业版和智能代理版不再出现在该工作流中。

## 三、类别映射与许可证

| 网页类别 | 渲染器命令 | 打包环境 | 许可证状态 |
| --- | --- | --- | --- |
| `community` | `yarn build-renders` | 睿眼社区版无签名或签名环境 | 不启用企业类别变量 |
| `enterprise` | `yarn build-renders-enterprise` | 睿眼企业版无签名或签名环境，并设置 `PLATFORM=yakitEE` | 保留原有校验 |
| `enterprise-no-license` | `yarn build-renders-enterprise-no-license` | 睿眼企业版免许可证无签名或签名环境，并设置 `PLATFORM=yakitEE` | 构建期设置 `REACT_APP_REQUIRE_ENTERPRISE_LICENSE=false` |

普通企业版与免许可证企业版使用不同输入值，选择免许可证类别不会改变 `enterprise` 的既有行为。

## 四、平台、架构与执行环境

| 任务 | 平台 | 架构 | 执行环境 | 安装格式 |
| --- | --- | --- | --- | --- |
| `build-macos-x64` | 苹果系统 | `x64` | `macos-15-intel` | `DMG` |
| `build-macos-arm64` | 苹果系统 | `arm64` | `macos-15` | `DMG` |
| `build-windows-x64` | 微软系统 | `x64` | `windows-2022` | `NSIS EXE` |
| `build-linux-x64` | 开源系统 | `x64` | `ubuntu-22.04` | `AppImage` |

不提供微软系统苹果芯片架构、开源系统苹果芯片架构、旧系统模式或跨系统模拟层构建。

## 五、打包命令与文件名称

`package.json` 提供十二条无签名命令和六条苹果系统签名命令。三种类别分别采用独立的睿眼环境，所有命令显式指定平台、架构和 `--publish never`，不会创建正式发布。

版本只读取根 `package.json`。安装文件名称为：

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

## 六、引擎预置与摘要

`packageScript/script/prepare-renyan-engine.js` 负责确定版本、限定版本字符、按平台选择工件、通过加密传输下载引擎与摘要、比较真实摘要、保持内部文件名并生成打包钩子可复验的归档记录。

关闭预置引擎时，打包配置不加入引擎版本文件，打包钩子不读取预置工件。开启时，最终版本写入 `bins/engine-version.txt` 和构建清单。项目推荐版本 `1.4.8-beta3` 的四个目标摘要地址均已取得有效响应。

四个任务分别声明 `x64`、`arm64`、`x64` 与 `x64` 目标架构，打包钩子优先采用该声明选择预置工件。本地直接调用打包命令时仍按打包器传入的架构编号解析。

## 七、构建元数据与直接安装文件

`packageScript/script/create-renyan-build-metadata.js` 根据集中品牌配置、根版本和目标定义检查真实安装文件，生成 `release/build-manifest.json` 与 `release/SHA256SUMS.txt`。

清单包含产品名称、短名称、品牌前缀、版本、类别、分支、提交、目标、平台、架构、签名状态、预置引擎状态、引擎版本、运行时版本、打包器版本、工作流运行编号和构建时间。清单与摘要仍在任务工作目录生成，用于确认安装文件身份。

上传步骤使用 `actions/upload-artifact@v7` 的 `archive: false`，输入只包含元数据步骤解析出的安装文件路径。Actions 页面中的产物名称等于安装文件名，点击后直接得到 `.exe`、`.dmg` 或 `.AppImage`。

## 八、签名机制

苹果系统签名仅在用户启用签名时读取账号、应用专用密码、团队、证书正文和证书密码五项密钥，并调用现有公证钩子。微软系统复用 `.github/actions/sign-windows/action.yml`，签名工具固定为 `7.0.1`，密钥库六项凭据只在签名任务中读取。

当前仓库没有开源系统安装文件签名机制，因此开源系统任务会拒绝签名选择。任何签名凭据缺失都会使对应任务失败，不会产生被标记为签名文件的无签名产物。

## 九、图标与图片

`app/assets/renyan-icon.icns`、`app/assets/renyan-icon.ico` 和 `product/brand/icons` 均存在且可读取，全尺寸品牌图标经视觉检查为睿眼图形。用户无需上传图片，GitHub Actions 页面截图不会写入仓库、安装文件或磁盘映像背景。

苹果磁盘映像继续采用打包器默认布局，不引用旧产品背景图。

## 十、验证与未执行事项

- 本地脚本语法、配置结构与工作流语法解析已经通过。
- 定向测试两个文件、十八项用例通过。
- 当前打包器版本与本地命令帮助确认平台和架构参数可用。
- 四个推荐引擎摘要地址均返回有效摘要。
- `actionlint` 未安装，因此采用仓库现有解析库和定向契约测试。
- 没有在微软系统主机生成苹果磁盘映像。
- 没有执行全量测试、全量规则检查、全量类型检查、浏览器测试或性能测试。
- 本次变更没有触发 GitHub Actions，也没有创建发布、标签或合并请求。用户手动触发的任务 `29392044377` 基于变更前的 `b812e3b`，不作为新增免许可证类别的远端验证。

新增免许可证类别的首次远端运行仍需验证托管执行环境中的完整依赖安装、签名账号权限、苹果公证、微软密钥库访问和四类最终安装文件。默认的免许可证企业版、微软系统、无引擎、无签名参数可用于首次定向验证。

## 十一、已知事项

- 工作流页面载入 `master` 定义时仍可能显示旧输入；必须在 `Use workflow from` 中选择 `qsh`。
- 开源系统签名未配置，启用签名会得到明确失败。
- 苹果和微软签名依赖仓库外部凭据，本地静态验证不能证明凭据有效。
- `bins/scripts/google-chrome-plugin.zip` 只存在于本地且不受版本控制；工作流按固定版本 `0.0.7` 下载并校验固定 SHA256，避免托管安装文件缺少扩展资源。
- 三份锁文件未修改，工作流采用冻结锁文件安装方式。
- 旧提交 `b812e3b` 生成的安装文件缺少 `product/build.js`，不能作为修复后的发布文件；必须使用包含启动修复的新提交重新构建。
- 源码目录设置 `ELECTRON_IS_DEV=0` 前必须执行对应的双渲染器构建；缺少 `app/renderer/pages/main/index.html` 会产生空白窗口。未打包的生产资源路径现在以仓库根目录为基准，避免错误定位到仓库上两级目录。
- 任务 `29396021957` 实际记录 `INCLUDE_ENGINE=true`，与网页表单当前未勾选状态无关；该次任务还暴露了苹果臂架构与开源系统英特尔架构在打包钩子中选择相反工件的问题，固定任务架构声明已经修正该路径。

网页与命令行操作见 `GITHUB_ACTIONS_PACKAGE.md`。
