# 睿眼多平台安装文件工作流移交

## 一、交付结论

`.github/workflows/multi-platform-build.yml` 已改造为 `RuiYan Multi-Platform Package`。网页输入只保留目标平台、社区版、企业版或企业版免许可证、是否预置引擎、引擎版本、是否签名和产物保留天数。四个平台分别在原生执行环境中构建，每个被选任务独立上传安装文件、构建清单和摘要文件。

默认路径生成无签名内部验证安装文件，不读取签名凭据。企业版调用 `yarn build-renders-enterprise` 并保留现有许可证校验；企业版免许可证调用仓库既有 `yarn build-renders-enterprise-no-license`，两类安装文件和产物容器使用不同名称。

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

## 七、构建清单、摘要与产物容器

`packageScript/script/create-renyan-build-metadata.js` 根据集中品牌配置、根版本和目标定义检查真实安装文件，生成 `release/build-manifest.json` 与 `release/SHA256SUMS.txt`。

清单包含产品名称、短名称、品牌前缀、版本、类别、分支、提交、目标、平台、架构、签名状态、预置引擎状态、引擎版本、运行时版本、打包器版本、工作流运行编号和构建时间。清单与日志不包含密码、令牌、授权头、证书或私钥。

无签名产物容器名称为：

```text
RuiYan-Community-macOS-x64-unsigned
RuiYan-Community-macOS-arm64-unsigned
RuiYan-Community-Windows-x64-unsigned
RuiYan-Community-Linux-x64-unsigned
RuiYan-Enterprise-macOS-x64-unsigned
RuiYan-Enterprise-macOS-arm64-unsigned
RuiYan-Enterprise-Windows-x64-unsigned
RuiYan-Enterprise-Linux-x64-unsigned
RuiYan-Enterprise-No-License-macOS-x64-unsigned
RuiYan-Enterprise-No-License-macOS-arm64-unsigned
RuiYan-Enterprise-No-License-Windows-x64-unsigned
RuiYan-Enterprise-No-License-Linux-x64-unsigned
```

签名产物将后缀改为 `signed`。

## 八、签名机制

苹果系统签名仅在用户启用签名时读取账号、应用专用密码、团队、证书正文和证书密码五项密钥，并调用现有公证钩子。微软系统复用 `.github/actions/sign-windows/action.yml`，签名工具固定为 `7.0.1`，密钥库六项凭据只在签名任务中读取。

当前仓库没有开源系统安装文件签名机制，因此开源系统任务会拒绝签名选择。任何签名凭据缺失都会使对应任务失败，不会产生被标记为签名文件的无签名产物。

## 九、图标与图片

`app/assets/renyan-icon.icns`、`app/assets/renyan-icon.ico` 和 `product/brand/icons` 均存在且可读取，全尺寸品牌图标经视觉检查为睿眼图形。用户无需上传图片，GitHub Actions 页面截图不会写入仓库、安装文件或磁盘映像背景。

苹果磁盘映像继续采用打包器默认布局，不引用旧产品背景图。

## 十、验证与未执行事项

- 本地脚本语法、配置结构与工作流语法解析已经通过。
- 定向测试两个文件、十六项用例通过。
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
- `bins/scripts/google-chrome-plugin.zip` 已存在并由既有打包配置引用，工作流不下载浏览器扩展。
- 三份锁文件未修改，工作流采用冻结锁文件安装方式。

网页与命令行操作见 `GITHUB_ACTIONS_PACKAGE.md`。
