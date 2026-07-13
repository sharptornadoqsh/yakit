# 睿眼产品化阶段一构建矩阵

## 一、平台配置

| 平台 | 显示名称 | 可执行文件 | 图标输入 | 产物规则 | 验证状态 |
| --- | --- | --- | --- | --- | --- |
| Windows | 睿眼自动化渗透系统 | `RenYan-Pentest.exe` | `app/assets/renyan-icon.ico` | `RenYan-Pentest-<版本>-windows-amd64.exe` | 配置与早期诊断产物已验证；最终源码不再打包 |
| macOS | 睿眼自动化渗透系统 | `RenYan-Pentest` | `app/assets/renyan-icon.icns` | `RenYan-Pentest-<版本>-darwin-<架构>.dmg` | 未执行，用户要求仅查看企业版免许可证开发界面 |
| Linux | 睿眼自动化渗透系统 | `renyan-pentest` | `product/brand/icons` | `RenYan-Pentest-<版本>-linux-<架构>.AppImage` | 未执行，用户要求仅查看企业版免许可证开发界面 |

## 二、最终开发构建

| 项目 | 值 |
| --- | --- |
| 构建命令 | `yarn build-renders-test-enterprise-no-license` |
| 主渲染类别 | 企业版，免许可证，开发工具版本 |
| 启动渲染类别 | 企业版 |
| 结果 | 成功，退出码为零，总耗时约六百一十九秒 |
| 主渲染输出 | `app/renderer/pages/main` |
| 启动渲染输出 | `app/renderer/engine-link-startup/dist` |
| 类别标记 | `企业版（免许可证）`，位于主渲染压缩产物 |
| 本地启动 | 成功，窗口标题为“睿眼自动化渗透系统”且响应正常 |

## 三、其他类别

| 类别 | 命令 | 状态 |
| --- | --- | --- |
| 普通企业版开发构建 | `yarn build-renders-test-enterprise` | 早期成功，随后被免许可证要求取代 |
| 社区版生产构建 | `yarn build-renders` | 早期源码状态曾成功；最终一次按用户新要求中止，不作为最终证据 |
| 社区版 Windows 安装 | `yarn pack-win` | 早期诊断产物成功；早于最终源码，不作为交付 |
| 企业版、轻量企业版、代码审计版、智能代理版安装 | 对应打包命令 | 未执行 |
| macOS 与 Linux 构建 | 对应构建命令 | 未执行 |

打包命令不会自动重建渲染器。若后续需要安装程序，应从已提交的干净源码重新执行匹配的渲染构建与平台打包，不应复用本阶段早期诊断安装文件。
