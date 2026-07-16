## 项目上下文摘要（企业免许可开发环境）

生成时间：2026-07-16 17:10:00 +08:00

### 一、目标与边界

- 提供可双击的微软系统脚本，同时启动主渲染器、启动渲染器和桌面主程序。
- 主渲染器采用企业类别、开发工具和免许可组合；启动渲染器沿用企业类别。
- 两个渲染器都使用开发服务器，源码变更由既有热更新机制即时呈现。
- 不改动生产构建、打包、许可证判断、桌面窗口加载逻辑或用户已有业务改动。

### 二、相似实现分析

- 根 `package.json` 的 `dev` 使用 `concurrently -k`、`wait-on` 与 `start-electron` 组合开发服务器和桌面主程序，可复用进程编排方式。
- 根 `package.json` 的 `start-renders-enterprise` 同时启动企业主渲染器与企业启动渲染器，可复用双渲染器分工。
- `app/renderer/src/main/package.json` 的 `electron-render-enterprise` 采用 `noBrouser,devTool,enterprise` 环境组合，可在此基础上加入 `enterpriseNoLicense`。
- `app/renderer/src/main/package.json` 的 `build-test-enterprise-no-license` 已证明 `enterprise,devTool,enterpriseNoLicense` 是现有免许可测试组合。
- `app/renderer/engine-link-startup/package.json` 的 `electron-render-enterprise` 使用 `vite --mode enterprise`，启动界面没有独立免许可类别，继续沿用该命令。

### 三、项目约定与可复用能力

- 根命令通过子项目脚本组合，不在批处理文件中复制渲染器参数。
- JSON 使用两个空格与既有脚本排序；批处理文件只负责定位仓库、设置标题并调用根命令。
- `concurrently` 负责三个长期进程的生命周期，`wait-on` 在桌面主程序启动前等待两个页面返回成功状态，双击脚本显式设置 `ELECTRON_IS_DEV=1`。
- 主渲染器的 `config-overrides.js` 已启用热更新；启动渲染器由 Vite 提供热更新。

### 四、输入输出与集成点

- 输入是双击仓库根目录的 `start-enterprise-no-license-dev.cmd`；该脚本为子进程设置开发模式环境变量。
- 主渲染器监听端口 `3000`，启动渲染器监听端口 `5173`。
- `app/main/index.js` 在开发模式分别加载 `http://127.0.0.1:3000` 与 `http://127.0.0.1:5173`。
- `REACT_APP_PLATFORM=enterprise` 与 `REACT_APP_REQUIRE_ENTERPRISE_LICENSE=false` 共同确定主界面类别；`VITE_PLATFORM=enterprise` 确定启动界面类别。
- 两个页面可访问后才启动桌面主程序；关闭桌面主程序或在控制台中止任务时，`concurrently -k` 终止同组开发服务器。

### 五、测试策略

- 解析两个 `package.json`，断言新增命令及环境组合准确。
- 静态检查批处理文件包含仓库定位、根命令调用和退出码传递。
- 启动冒烟检查应看到端口 `3000`、`5173` 返回成功页面，且桌面主程序进程存在。
- 冒烟检查结束后按进程树清理，并复查本任务创建的进程已退出。

### 六、风险与充分性检查

- 端口被其他程序占用时，开发服务器无法按桌面主程序固定地址提供页面；脚本保留原始错误输出以便定位。
- 首次启动依赖三个依赖目录已经安装；仓库既有安装命令仍是依赖准备入口，本任务不增加安装机制。
- 免许可变量只影响主渲染器，启动渲染器继续使用企业类别符合现有生产构建组合。
- 接口契约、环境组合、端口、生命周期与验证方式均有现有源码依据，可以进入实施阶段。
