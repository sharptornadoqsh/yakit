# 项目上下文摘要（仅使用仓库引擎）

生成时间：2026-07-16 18:16:32 +08:00

## 一、需求与验收

- 目标：企业免许可证开发启动时只恢复仓库内、受兼容清单约束的 Yak 引擎，不因本地引擎缺失而自动联网下载。
- 范围：预置引擎压缩包定位、启动页缺失与恢复失败分支、相邻回归测试。
- 验收：开发环境识别 `bins/yak_windows_amd64.zip`；预置工件恢复继续验证内部引擎摘要；启动缺失与恢复失败分支不调用网络下载界面；现有用户主动升级接口保持兼容。

## 二、相似实现分析

- `app/main/filePath.js`：开发模式直接按仓库相对路径读取附加资源，打包模式按应用资源目录读取；预置工件定位必须继续使用 `loadExtraFilePath`。
- `app/main/handlers/upgradeUtil.js`：`getBundledEngineInfo` 负责工件存在性与可信状态，`restoreVerifiedBundledEngine` 复用摘要校验、提取与原子安装协议。
- `app/renderer/engine-link-startup/src/pages/StartupPage/index.tsx`：`decideEngineStartup` 已把缺失状态定义为等待处理，当前组件却在该分支设置下载状态，形成启动阶段自动联网行为。
- `app/renderer/engine-link-startup/src/pages/StartupPage/components/DownloadYaklang/index.tsx`：组件在可见时主动查询版本并下载，直接触发 `EngineLink:download-latest-yak`。
- `product/engine-compatibility.json`：微软系统六十四位工件同时声明仓库名称 `bins/yak_windows_amd64.zip` 与打包名称 `bins/yak.zip`，内部引擎摘要与当前仓库工件一致。

## 三、项目约定与复用组件

- 主进程沿用 CommonJS、两个空格、单引号、无分号与尾随逗号；渲染器沿用 React、TypeScript 与相邻状态处理方式。
- 复用 `getCompatibilityEntry`、`loadExtraFilePath`、`extractAndVerifyEngineArchive`、`atomicInstallEngine` 与 `decideEngineStartup`。
- 工件选择顺序为打包名称优先、仓库来源名称次之；两者均不存在时保留打包名称作为诊断路径。

## 四、测试策略

- 在 `app/main/__test__/engineLifecycle.test.js` 增加工件路径选择用例，覆盖打包工件存在、仅仓库工件存在和全部缺失。
- 在启动页相邻测试中检查缺失决策保持等待处理，并验证启动源码的自动缺失与恢复失败分支不再设置下载状态。
- 执行引擎生命周期、产品配置与启动生命周期定向测试，并执行格式、类型或构建检查中的适用部分。

## 五、依赖、集成点与风险

- 输入为兼容清单中的 `packagedArchive`、`sourceArchive` 与当前平台条目；输出为存在的预置压缩包路径及可信状态。
- 启动页通过 `GetBuildInEngineVersion` 判断预置工件，通过 `RestoreEngineAndPlugin` 完成恢复；工件路径选择错误会把预置引擎误判为缺失。
- 保留主界面用户主动升级接口，避免扩大本次变更；启动阶段不再自动下载，仓库工件真实缺失时将保留可诊断状态。
- 当前相关主进程文件含用户尚未提交的内置引擎修复，本次仅在其基础上追加路径选择与启动行为，不覆盖既有摘要策略。
