# 项目上下文摘要：Windows 客户端身份请求头

生成时间：2026-07-27 15:31:25 +08:00

## 一、目标与范围

目标是在不改变 online 接口、账号密码处理和协作身份头名称的前提下，消除 Windows 电脑名称包含中文、表情、控制字符或超长内容时产生的 `ERR_INVALID_CHAR`。产品源码范围限定为 `app/main/collaborationClientIdentity.js`，回归测试限定为 `app/main/__test__/collaborationClientIdentity.test.js`。

不新增第三方依赖，不升级依赖，不制作安装包，不提交或推送。仓库分支为 `qsh`，研究开始时工作区无修改。

## 二、现有实现与调用关系

### 实现一：协作客户端身份头生成

- 文件：`app/main/collaborationClientIdentity.js`
- `createCollaborationClientHeaders` 读取 `collaborationClientId`，无效时调用 `crypto.randomUUID` 并通过 `setConfig` 持久化。
- `os.hostname()` 的结果经过 `normalizeHeaderValue` 后写入 `X-Yakit-Device-Name` 与 `X-Yakit-Hostname`。
- 当前 `normalizeHeaderValue` 仅删除回车与换行、去除首尾空白并截取二百五十五个字符，没有限制为可打印 ASCII。
- 可复用部分：依赖注入式的 `getConfig`、`setConfig`、`createId` 与 `hostname`，以及既有客户端标识正则。

### 实现二：Axios 请求集成

- 文件：`app/main/httpServer.js`
- `getCollaborationClientHeaders` 在首次请求时生成并缓存身份头。
- Axios 请求拦截器通过 `applyCollaborationClientHeaders` 将身份头写入每个请求。
- `httpApi` 最终调用同一 Axios 实例，因此登录请求在网络发送前会进入 Node.js 请求头校验。
- 该文件无需修改；身份值生成处是最小修改边界。

### 实现三：持久化配置

- 文件：`app/main/filePath.js`
- `getConfig` 从产品配置目录的 `config.json` 读取配置。
- `setConfig` 合并单个配置项并写回同一文件。
- 非法 `collaborationClientId` 的处理应继续调用既有 `setConfig`，不得建立新的配置协议。

### 实现四：现有身份头测试

- 文件：`app/main/__test__/collaborationClientIdentity.test.js`
- 使用 Vitest、直接依赖注入和 `vi.fn`，不依赖 Electron 环境。
- 当前覆盖首次生成标识、复用持久化标识和覆盖调用方伪造头。
- 新测试沿用同一文件、同一依赖注入方式和中文测试说明。

### 相邻测试模式

- `app/main/__test__/security.test.js` 使用 `it.each` 表达输入类别与边界。
- `app/main/__test__/applicationArtifact.test.js` 对兼容行为使用字面量断言。
- `app/main/__test__/securityCredentials.test.js` 通过依赖注入验证正常、缺失和异常输入。

## 三、故障复现与问题原因

本机 Node.js 版本为 `v22.13.0`。使用当前生产函数注入中文电脑名称 `中文电脑`，随后对生成的每个头调用 `http.validateHeaderValue`，稳定得到：

```text
TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["X-Yakit-Device-Name"]
```

截图中的调用栈同样位于 `ClientRequest.setHeader`、`follow-redirects` 与 Axios 适配器。请求尚未进入网络传输，因而界面中的密码或网络提示不能代表 online 返回的认证结果。

单一问题原因是身份头生成层未建立 HTTP 请求头字符约束。浏览器不生成这些桌面端身份头，因此相同账号、密码和地址可在浏览器使用，而客户端在请求构造阶段失败。

## 四、技术方案

- 普通可打印 ASCII 值在既有去除首尾空白后保持原值。
- 空设备名称继续使用 `unknown`。
- 非 ASCII、回车、换行、其他控制字符或超过二百五十五个字符的值，使用内置 `crypto` 的 SHA-256 生成 `encoded-` 加十六进制摘要。该结果固定、短小且只含 ASCII。
- 持久化客户端标识在安全转换前按 `CLIENT_ID_PATTERN` 校验；非法值调用既有 `createId` 与 `setConfig`。
- 五个 `X-Yakit-*` 值均通过统一函数生成，并在返回前调用 Node.js 的 `http.validateHeaderValue`。
- 时间复杂度与输入长度成线性关系，单个异常值仅执行一次摘要计算；无额外网络或文件输入输出。

## 五、测试策略

- 普通英文电脑名称保持原值。
- 中文、表情、回车、换行、其他控制字符和超长名称得到固定的 ASCII 摘要值。
- 空名称得到 `unknown`。
- 带非法字符的持久化 `collaborationClientId` 触发重新生成与持久化。
- 注入异常平台、架构和版本后，最终全部 `X-Yakit-*` 头均通过 `validateHeaderValue`。
- 目标测试经历失败与成功两个状态，证明新增断言能够捕获现有缺陷。
- 使用本地 HTTP 服务接收带中文原始主机名生成的 Axios 请求，证明请求能够到达服务端。

## 六、依赖与集成点

- 外部依赖：无新增。
- 内置模块：`crypto`、`os`、`http`。
- 内部依赖：`filePath.getConfig`、`filePath.setConfig`、`httpServer` 请求拦截器。
- online 契约：五个头名称、客户端标识持久化键和账号密码数据保持不变。

## 七、检索与资料记录

- CodeGraph 索引包含一千八百一十七个文件，状态为最新。
- CodeGraph 确认身份头生成函数仅由 `httpServer` 使用；`httpApi` 的已索引调用方包括用户信息与上传路径。
- 仓库内仅发现这一组 `X-Yakit-*` 身份头定义和测试，没有重复实现。
- Node.js 官方文档说明 `validateHeaderValue` 与请求发送时的底层校验一致，非法字符错误码为 `ERR_INVALID_CHAR`。
- 当前环境未提供 `context7` 与 `shrimp-task-manager` 接口，分别以 Node.js 官方文档和本地任务计划替代。
- `github.search_code` 因远端速率限制失败，项目内调用图谱、现有测试和 Node.js 官方行为构成替代证据。

## 八、充分性检查

- 接口契约明确：输入为配置、主机名、平台、架构和版本，输出为五个字符串请求头。
- 技术选择明确：内置摘要保证异常输入的确定性、长度上限与 ASCII 范围。
- 主要风险明确：不得让非法客户端标识在转换后绕过重新生成，不得改变合法 ASCII 行为。
- 验证方式明确：目标 Vitest、Node.js 语法检查、格式检查、差异检查和本地 Axios 发送验证。
- 已识别既有组件、命名约定、文件组织、测试风格及配置集成点，可以进入测试驱动实施。
