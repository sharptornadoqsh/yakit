## 项目上下文摘要（团队共享双客户端本机验收）

生成时间：2026-07-23 23:35:35 +08:00

### 1. 相似实现分析

- `app/main/ipc.js`
  - 通过 `@grpc/proto-loader` 与 `@grpc/grpc-js` 加载 `app/protos/grpc.proto`。
  - 非 TLS 引擎连接使用 `authorization: bearer <secret>` 元数据。
  - 可复用协议加载参数、元数据和普通请求调用方式。
- `app/main/handlers/project.js`
  - `ExportProject` 与 `ImportProject` 使用服务端流，并转发进度、错误与结束事件。
  - 可复用项目请求字段及流式完成条件。
- `app/main/handlers/manageYakScript.js`
  - `SaveYakScript`、`QueryYakScript`、`SaveYakScriptGroup` 与 `GetYakScriptGroup` 直接转发到 Yak 引擎。
  - 可复用插件保存、查询及分组请求结构。
- `app/main/__test__/projectArchive.test.js`
  - 使用真实临时文件和 SHA-256 验证项目归档读取、写入与完整性。
  - 本次验收继续使用真实文件大小、SQLite 文件头与 SHA-256 作为证据。
- `app/renderer/src/main/src/pages/teamCollaboration/__test__/teamProjectBundleRuntime.test.ts`
  - 覆盖项目导入导出编排和同名项目处理，但通信为模拟实现。
  - 本次脚本直接调用真实引擎，弥补模拟通信无法证明本机数据库写入的问题。
- `app/renderer/src/main/src/pages/pluginHub/pluginHubList/__test__/teamPluginInstall.test.ts`
  - 覆盖插件正文摘要、保存和本机冲突策略，但保存函数为模拟实现。
  - 本次脚本直接调用 `SaveYakScript`、`QueryYakScript` 和分组接口，验证真实配置库。

### 2. 项目约定

- 命名使用 `camelCase`，常量使用 `UPPER_SNAKE_CASE`。
- Node.js 脚本位于 `scripts/`，采用 CommonJS、两个空格、单引号、无分号和尾随逗号。
- 脚本只负责验收，不改变产品协议、业务状态或构建配置。
- 当前工作分支为 `qsh`，工作树在编码前为空。

### 3. 可复用组件清单

- `app/protos/grpc.proto`：Yak 引擎服务与消息定义。
- `@grpc/grpc-js`：真实引擎客户端与元数据。
- `@grpc/proto-loader`：运行时协议加载。
- Node.js `child_process`：启动并停止独立引擎实例。
- Node.js `crypto`、`fs`、`path`：归档摘要、数据库文件与证据文件检查。

### 4. 测试策略

- 以单个可执行验收脚本作为真实集成测试。
- 客户端甲和客户端乙分别使用独立的 `YAKIT_HOME`、项目库、配置库、端口与密钥。
- 正常流程覆盖项目创建、导出、跨客户端导入、插件保存查询、分组、映射与重启持久性。
- 边界流程覆盖双客户端隔离、错误密钥拒绝、导入前乙端不可见、重启后数据仍存在。
- 证据文件记录端口、数据目录、项目和插件标识、归档摘要、数据库路径与各断言状态。

### 5. 依赖和集成点

- 外部依赖：本机已有 Yak 引擎可执行文件。
- 内部依赖：仓库根目录的 gRPC 依赖和 `app/protos/grpc.proto`。
- 配置来源：`YAK_TEAM_ACCEPTANCE_ENGINE`、`YAK_TEAM_ACCEPTANCE_ROOT` 与可选端口环境变量。
- 集成点：`NewProject`、`GetProjects`、`ExportProject`、`ImportProject`、`SaveYakScript`、`QueryYakScript`、`SaveYakScriptGroup`、`GetYakScriptGroup`、`SetKey`、`GetKey`。

### 6. 技术选型理由

- 使用现成 Yak 引擎可以验证真实 SQLite 写入和重启持久性，同时避免 Yakit 构建。
- 运行时加载仓库协议能确保脚本与当前源码的 gRPC 契约一致。
- 脚本自行管理两个隔离实例，减少人工操作差异，并可生成可追踪的结构化证据。
- 该方法不覆盖 Electron 渲染、预加载和 IPC 界面联动，文档必须保留这一边界。

### 7. 关键风险点

- 引擎端口已被占用时必须立即失败，避免连接到无关实例。
- 引擎路径或版本不支持目标接口时必须输出明确失败项。
- 项目导出流只有在收到结束事件且归档存在时才算成功。
- 进程停止必须等待退出，重启必须复用乙端原数据目录和数据库名称。
- 验收目录不得与用户现有数据目录重合，脚本不得删除用户现有数据。
- 结构化任务管理工具当前未提供；任务分解由内置计划记录，限制写入本操作记录。

### 8. 上下文充分性检查

- 能定义接口契约：是，协议文件给出全部请求和响应字段。
- 理解技术选型：是，目标是验证真实引擎和数据库且不得构建 Yakit。
- 已识别主要风险：是，覆盖端口、路径、流式完成、隔离和进程生命周期。
- 知道验证方式：是，脚本断言、证据 JSON、SQLite 文件头、归档 SHA-256 与乙端重启复查。
- 不重复现有实现：是，现有测试均未直接验证两个隔离真实引擎；脚本复用既有协议，不新增存储协议。

### 9. 真实引擎执行后的补充发现

- Yak 引擎的 `ExportProject` 读取项目 SQLite 主文件；当前项目的新写入可能仍位于预写日志中。
- 真实执行证明：未关闭当前项目数据库时，`SetProjectKey` 写入在甲端可读，但乙端导入后为空；关闭数据库再导出后，结构化项目数据可以完整恢复。
- `teamProjectBundleRuntime.ts` 是团队项目发布和同名项目备份共用的导出适配层，适合在导出当前项目时暂时关闭数据库并在结束后恢复。
- 新增测试覆盖当前项目正常导出、非当前项目导出和导出失败恢复，沿用现有 `ProjectTransferIpc` 与 Vitest 模式。
- 双客户端脚本改为使用 `SetProjectKey` 保存目标、任务、测试数据和测试结果，并在乙端导入及重启后读取相同结构。
- 插件验证使用普通 `Exec` 子进程路径读取标准输出；当前引擎的 `NoDividedEngine` 路径不会把 `println` 标准输出写入返回流。
- 项目与插件映射按生产类型保存全部字段，但使用本地合成的远端编号，只证明本机结构和持久性，不代表 online 到客户端链路。
