## 项目上下文摘要（启动模块与直接安装文件）

生成时间：2026-07-15 14:18:30 +08:00

### 一、故障复现与判断

- 已安装应用在 Electron 主进程加载 `app/main/about.js` 时抛出 `Cannot find module '../../product/build'`。
- 已安装文件位于 `D:\ProgramFiles\RenYan-Pentest\resources\app.asar`，归档包含 `app/main/about.js`、`product/renyan.json` 与 `product/engine-compatibility.json`，不包含 `product/build.js`。
- `packageScript/electron-builder.config.js` 先排除 `product/**/*`，随后只重新加入两个 JSON 文件，因此源码引用正确，打包清单遗漏运行时依赖。

### 二、三个相似打包模式

- `app/main/product.js` 读取 `product/renyan.json`，打包清单使用 `product/renyan.json` 显式加入归档。
- `app/main/engineLifecycle.js` 读取 `product/engine-compatibility.json`，打包清单使用 `product/engine-compatibility.json` 显式加入归档。
- `app/main/about.js` 读取 `product/build.js`，应沿用相同模式将该文件显式加入归档，不改写产品类别算法。
- 关于窗口的法律文档位于归档外，现有配置使用 `extraResources` 显式复制；该模式适用于外部打开的静态文件，不适用于 CommonJS 模块。

### 三、直接安装文件模式

- 当前四个原生任务均使用 `actions/upload-artifact@v7`，上传安装文件、构建清单和摘要文件，因此网页产物为 ZIP。
- 官方 `upload-artifact@v7` 支持 `archive: false`；该模式只允许一个文件，并使用文件名作为产物名。
- 四个任务已经由元数据步骤提供唯一的 `artifact_path`，可直接作为单文件上传路径。
- 微软系统上传 `.exe`，苹果系统上传 `.dmg`，开源系统上传 `.AppImage`；每个架构保持一个安装文件。

### 四、项目约定与测试策略

- 变更限定为打包文件清单、四个上传步骤、相邻测试和操作文档。
- `app/main/__test__/product.test.js` 验证运行时产品依赖进入打包清单。
- `app/main/__test__/renyanPackaging.test.js` 验证四个上传步骤使用单文件路径、`archive: false`、错误处理与保留天数。
- 本地微软系统无引擎打包后检查 `app.asar` 包含 `product/build.js`，并扫描主进程相对依赖，确认归档内不存在缺失模块。

### 五、前端名称范围

- `product/renyan.json` 的 `shortName` 是状态栏、关于入口、社区配置提示和苹果应用短名称的共享显示来源，应从 `RenYan Pentest` 改为 `RuiYan Pentest`。
- 英文组件文案、英文下载文案与网页清单各有一处旧显示值，需要同步修改。
- 主渲染器、启动渲染器和品牌源目录的八个 SVG 字标包含旧英文大写文本，需要改为 `RuiYan Pentest`。
- 品牌生成脚本对短名称调用 `upper()`，会在再次生成资源时恢复全大写文本，需要改为保留配置中的大小写。
- `renyan` 文件路径、组件名、翻译键、样式变量、事件名、应用标识、可执行文件名和用户数据目录属于内部协议或兼容标识，不在前端显示文本修改范围内。

### 六、依赖、风险与充分性

- 只增加现有纯 JavaScript 模块，不扩大整个 `product` 目录的打包范围。
- `archive: false` 会使构建清单与摘要不再位于 Actions 产物中，但它们仍在任务工作目录生成；该取舍符合每个架构只提供一个安装文件的要求。
- Actions 直接文件依然受产物保留期和仓库访问权限约束；长期公开分发仍应使用 GitHub Release。
- 只修改可见字符串及其资源生成来源，不进行大小写不敏感的全仓库机械替换，避免改变安装目录、进程名和应用数据位置。
- 接口、现有模式、测试位置、打包验证方式和用户可见结果均有明确证据，可以进入实施阶段。

### 七、源码生产模式空白窗口

- `app/main/index.js` 在 `ELECTRON_IS_DEV=0` 时载入 `app/renderer/pages/main/index.html`；该文件由双渲染器生产构建生成，缺失时会报告 `ERR_FILE_NOT_FOUND` 并显示空白窗口。
- `app/main/filePath.js` 原先只依据 `electron-is-dev` 区分资源路径，导致未打包 Electron 在生产资源模式下使用安装目录算法，并把 `bins` 错误定位到仓库上两级目录。
- 路径判断需要同时检查 `app.isPackaged`：源码生产模式从 `app.getAppPath()` 指向的仓库根目录解析，已安装程序保持现有安装资源目录规则。
- 本地验证需要先完成与类别匹配的双渲染器构建，再设置 `ELECTRON_IS_DEV=0` 启动 Electron；缺少渲染器产物不属于资源路径算法可以替代的步骤。

### 八、远端引擎架构故障

- 任务 `29396021957` 的四个任务环境均记录 `INCLUDE_ENGINE=true`，所以该次任务启用了预置引擎；网页表单当前未勾选不会改变已经创建任务的输入。
- 苹果臂架构准备步骤正确生成 `yak_darwin_arm64`，打包钩子却读取 `yak_darwin_amd64.zip`；开源系统英特尔架构准备步骤正确生成 `yak_linux_amd64`，打包钩子却读取 `yak_linux_arm64.zip`。
- 微软系统英特尔架构采用相同流程并成功，说明下载、摘要与免许可证类别本身不是共同故障点；失败发生在打包钩子的架构选择边界。
- 四个工作流任务应显式声明其固定目标架构，打包钩子在工作流中优先采用该值；本地直接打包仍保留构建工具架构编号映射。

### 九、浏览器扩展资源

- 托管任务日志报告 `bins/scripts/google-chrome-plugin.zip` 不存在；本地同名文件未受版本控制，因此每个全新执行环境都会缺少该资源。
- 主进程的扩展导出处理会读取该压缩包，缺失不会导致安装构建失败，但会使对应功能在安装后报告文件不存在。
- 本地压缩包清单版本为 `0.0.7`，大小为 `2679292` 字节，SHA256 为 `5b250638ce76c95e9bc2c25db48049eac1f7af25fe34187e2b0997b872811f6d`；固定 HTTPS 地址返回相同长度。
- 四个任务需要在打包前下载固定版本并校验固定摘要，不采用动态最新版或非加密版本地址。
