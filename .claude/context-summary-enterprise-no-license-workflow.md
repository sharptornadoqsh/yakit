## 项目上下文摘要（企业版免许可证工作流）

生成时间：2026-07-15 13:32:45 +08:00

### 一、需求判断

- 新增 `enterprise-no-license` 网页类别，保留 `community` 与 `enterprise` 原有行为。
- `enterprise` 继续调用普通企业渲染命令并保留许可证校验。
- `enterprise-no-license` 调用仓库既有免许可证双渲染命令，安装文件名、产物容器和构建清单必须明确标识免许可证类别。
- 变更沿用现有四个原生任务、引擎准备、签名分流和上传协议，不增加任务或输入字段。

### 二、相似实现分析

- `app/renderer/src/main/package.json` 与 `app/renderer/src/main/.env-cmdrc`：`build-enterprise-no-license` 组合企业类别和 `enterpriseNoLicense` 环境，令 `REACT_APP_REQUIRE_ENTERPRISE_LICENSE=false`，可直接复用。
- 根 `package.json`：`build-renders-enterprise-no-license` 组合免许可证主渲染器与企业启动渲染器，构成完整双渲染构建入口。
- `product/build.js` 的 `resolveEdition`：企业类别在许可证要求为 `false` 时显示“企业版（免许可证）”，打包环境需要传入相同变量以保持关于信息一致。
- `.github/workflows/multi-platform-build.yml`：社区版与企业版已经分别映射渲染命令和打包命令；新增类别沿用相同分支位置。
- `packageScript/buildHook/before-pack.js` 与 `packageScript/script/create-renyan-build-metadata.js`：两处使用相同类别标签生成安装文件名、构建清单和产物容器，需要同步增加标签。

### 三、项目约定

- 工作流只使用 `workflow_dispatch`，四个任务分别使用原生执行环境，且只允许从 `qsh` 构建。
- JavaScript 使用两空格、单引号、无分号和尾逗号；JSON 与 YAML 沿用现有排序和缩进。
- 打包命令显式指定平台、架构、配置文件和 `--publish never`。
- 测试位于 `app/main/__test__/renyanPackaging.test.js`，使用 Vitest、YAML 结构断言和临时目录验证产物元数据。

### 四、可复用组件

- `yarn build-renders-enterprise-no-license`：现成的免许可证双渲染构建。
- `renyanEnterpriseUnsigned` 与 `renyanEnterpriseSigned`：企业打包环境结构，新增类别环境沿用其平台与签名字段。
- `resolveRuiYanArtifactName`：安装文件名入口。
- `createArtifactIdentity` 与 `createBuildMetadata`：安装文件、清单、摘要和产物容器入口。
- 四个现有原生任务：平台、引擎、签名、元数据和上传协议全部复用。

### 五、依赖与集成点

`edition` 输入依次影响渲染命令、打包环境、安装文件名、元数据参数和上传容器。免许可证类别必须在五个位置使用同一字符串，否则元数据会找不到安装文件。微软系统签名发生在无签名打包之后，苹果系统签名由独立打包环境负责，开源系统仍拒绝签名请求。

### 六、测试策略

- 断言 `edition` 三个选项及普通企业、免许可证企业两条渲染命令同时存在。
- 断言免许可证签名和无签名环境包含企业平台、独立类别及许可证变量。
- 断言六条免许可证打包命令存在并使用 `--publish never`。
- 生成免许可证企业安装文件元数据，验证文件名、清单类别和产物容器。
- 复验原有社区版、普通企业版、引擎准备和无引擎打包用例。

### 七、风险与充分性检查

- 类别命名不一致会使元数据阶段失败，因此安装钩子和元数据标签必须同时修改。
- 直接改写 `enterprise` 会改变既有许可证语义，新增显式类别可避免该风险。
- 不修改许可证判断实现，仅选择仓库已有构建环境。
- 接口契约、技术选择、主要风险和验证方式均已有明确源码与测试证据，可以进入实施阶段。
