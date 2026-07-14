# 项目上下文摘要（睿眼阶段八安全核查）

生成时间：2026-07-14 22:55:36 +08:00

## 一、任务范围与验收条件

本阶段限定处理需求序号二十六至三十一。代码调整必须直接对应登录摘要协议兼容、传输层证书校验、令牌生命周期、密码复杂度、远程引擎凭据、日志敏感信息或外部地址协议限制。外部账号服务协议、服务端实现、软件打包、跨平台验证与全仓库安全改造不在范围内。

验收条件如下：

- 客户端继续在提交登录请求时生成 MD5，不改变服务字段和授权请求头格式。
- 私有域原始密码与 MD5 结果不进入持久化配置或日志，登录结束后清除密码字段。
- 主侧 HTTP 客户端默认验证 HTTPS 证书，HTTP 地址在界面显示明确警示。
- 令牌仅保存在当前进程状态中，退出、认证失效和服务根地址变化均清除旧令牌。
- 密码复杂度检查覆盖八至二十位、大小写字母、数字、特殊字符和完整字符串边界。
- 远程引擎历史不保存密码；当前远程凭据仅在操作系统安全存储可用时加密保存，否则只保存非敏感连接参数。
- 外部服务端密码存储、复杂度强制和权限拒绝没有动态证据时维持待确认状态。

## 二、相似实现分析

- `app/renderer/src/main/src/components/ConfigPrivateDomain/ConfigPrivateDomain.tsx`
  - 模式：表单提交后通过 `NetWorkApi` 调用外部账号服务，密码只应在 `loginUser` 内生成 MD5。
  - 可复用：`YakitInput.Password`、`YakitAlert`、`getRemoteHttpSettingGV`、`yakitAuth.editBaseUrl`。
  - 事项：当前存在可逆 Base64 密码保存、失败信息直接展示和密码字段未清除的问题。
- `app/main/httpServer.js` 与 `app/main/state.js`
  - 模式：单一 Axios 实例在请求前按当前服务根地址生成 `/api/` 基址，并从进程内 `USER_INFO` 写入 `Authorization`。
  - 可复用：`normalizeHttpBaseUrl`、`resetUserInfo`、`pickAxiosErrorCore`。
  - 事项：HTTPS 代理和直连代理均关闭证书校验；认证失效响应会携带包含令牌的完整用户状态。
- `app/renderer/src/main/src/components/layout/RemoteEngine/RemoteEngine.tsx`
  - 模式：主渲染端读取本地当前连接和引擎侧历史连接，提交后分别保存。
  - 可复用：`LocalGVS.YaklangRemoteEngineCredential`、既有远程历史增删接口。
  - 事项：当前连接和历史连接均包含密码。
- `app/renderer/engine-link-startup/src/pages/StartupPage/components/RemoteEngine/RemoteEngine.tsx`
  - 模式：启动渲染端与主渲染端使用同一缓存键和同类历史接口。
  - 可复用：与主渲染端相同的远程连接参数结构。
  - 事项：两处实现必须保持相同行为，避免一个入口再次写入明文密码。
- `app/renderer/src/main/src/pages/SetPassword.tsx`
  - 模式：表单内自定义校验器检查新密码与确认密码，服务端执行最终变更。
  - 可复用：现有国际化提示和表单错误呈现。
  - 事项：正则缺少结尾边界，能够接受符合前缀后继续附加字符的输入。
- `app/main/security.js` 与 `app/main/handlers/openWebsiteByChrome.js`
  - 模式：主进程统一将外部地址限制为 HTTP 与 HTTPS 协议。
  - 可复用：`normalizeHttpUrl`、`normalizeHttpBaseUrl`。
  - 事项：现有协议限制满足外部管理地址要求，需要增加定向测试固定该行为。

## 三、项目约定

- 组件与类型使用大驼峰，函数与变量使用小驼峰，测试位于相邻 `__test__` 目录。
- JavaScript 与 TypeScript 采用两空格、单引号、无分号和尾逗号。
- 用户可见文字进入三个语言目录，代码标识符保持英文。
- 主进程负责操作系统安全存储与网络代理，渲染端不直接调用 `safeStorage`。
- 修改只进入 `qsh`，远端仅为 `origin/qsh`。

## 四、可复用组件与接口

- `app/main/security.js`：外部地址协议限制和服务根地址规范化。
- `app/main/localCache.js`：两个渲染端共用的本地缓存主进程入口。
- `app/main/state.js`：进程内用户状态与会话清理。
- `app/renderer/src/main/src/services/fetch.ts`：标准服务响应解析和认证失效处理。
- `app/renderer/src/main/src/components/yakitUI/YakitAlert/YakitAlert.tsx`：HTTP 地址警示。
- `app/renderer/src/main/src/utils/login.tsx`：本地退出路径。

## 五、测试策略

- 测试框架：Vitest。
- 主侧安全测试：验证外部地址协议、服务根地址规范化、令牌移除和安全缓存的正常、边界与失败分支。
- 渲染工具测试：验证密码复杂度正常输入、长度边界、字符类别缺失、非法后缀和非字符串输入。
- 静态检查：使用有界 `git grep` 确认证书校验、敏感字段持久化和日志调用。
- 不执行全量测试、全量类型检查、完整规则检查、构建或打包。

## 六、依赖与集成点

- 外部依赖：Electron 27 的主进程 `safeStorage`；Axios；`hpagent`。
- 内部依赖：`localCache.js` 同时服务主渲染端和启动渲染端；两套远程引擎组件使用同一缓存键。
- 配置来源：服务根地址来自私有域配置；授权令牌来自 `USER_INFO`；额外受信任根证书沿用 Node 启动时的 `NODE_EXTRA_CA_CERTS`。
- 外部服务：登录、用户、角色、密码策略和服务端权限均由仓库外服务最终判定。

## 七、技术选择与风险

- 采用主进程集中加密远程引擎当前凭据，避免扩大预加载桥和两个渲染端的接口数量。
- 操作系统安全存储不可用或 Linux 后端为 `basic_text` 时删除密码字段，仅保存连接地址、端口、证书和显示名称。
- 旧版明文远程凭据首次读取时删除密码并改写缓存；旧版引擎历史密码通过空值写回清除。
- 认证失效在主进程立即清除令牌，同时向渲染端返回不含令牌的退出所需用户信息。
- 当前没有低权限账号、服务端源码、数据库结构或第三方报告，相关结论不能标为完成。

## 八、工具与资料说明

CodeGraph 索引有效且为最新状态。顺序思考、任务管理器、桌面文件管理、Context7 与 GitHub 代码搜索接口当前不可用，采用会话计划、CodeGraph、`rg`、有界 `git grep`、PowerShell 和 `apply_patch` 完成对应工作。Electron 27 的 `safeStorage` 行为依据官方版本文档核对；需求工作簿通过只读 OLE DB 提取，序号二十六至三十一与目标文件一致。
