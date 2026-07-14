# 项目上下文摘要（睿眼阶段五协作能力审计）

生成时间：2026-07-14 14:09:04 +08:00

## 一、相似实现分析

- `app/renderer/src/main/src/pages/loginOperationMenu/AccountAdminPage.tsx`：账号、组织层级、角色分配、重置密码均通过 `NetWorkApi` 调用远端相对路径；可复用页面和请求类型，不能据此认定服务端存在。
- `app/renderer/src/main/src/pages/loginOperationMenu/RoleAdminPage.tsx`：角色列表与增删改调用 `roles`，权限表单只保存插件类型和插件标识；可复用角色页面，不能覆盖通用资源授权。
- `app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx`：项目和文件夹使用引擎 RPC，支持 `FolderId` 与 `ChildFolderId`；可复用项目层级，不能等同于团队项目组。
- `app/renderer/src/main/src/components/layout/utils.ts` 与 `app/renderer/src/main/src/utils/login.tsx`：企业登录后按配置触发漏洞和 HTTP Flow 上传；只能证明上传链路，不能证明多人共享读取。

## 二、项目约定

- 文档使用简体中文，需求编号保持 19、20、21、24、28、29、30 与稳定编号映射不变。
- 源码使用两空格、单引号、无分号与尾逗号；本任务不改源码。
- 证据结论必须区分页面、请求契约、主侧转发、引擎 RPC 和真实业务服务。
- 阶段五状态使用用户指定的六类结论，不改写基线静态证据分类。

## 三、可复用组件清单

- `app/renderer/src/main/src/services/fetch.ts`：远端 HTTP 请求封装。
- `app/renderer/src/main/src/services/electronBridge.ts`：预加载桥访问入口。
- `app/renderer/src/main/src/components/yakitUI/RenyanState`：无权限、离线、错误和空状态组件。
- `app/renderer/src/main/src/routes/renyanMenu.ts`：阶段二菜单交付状态与可导航规则。
- `app/renderer/src/main/src/store/index.ts`：当前用户、角色、令牌和远程状态模型。

## 四、测试策略

- 只读提取工作簿目标行并比对需求原文。
- 对菜单模型执行单文件定向测试，不执行全量测试。
- 对 Markdown 表头、七项状态、内部链接和 UTF-8 编码执行本地检查。
- 执行 `git branch --show-current` 与 `git diff --check`，不执行构建、打包或远端服务验证。

## 五、依赖和集成点

- 远端 HTTP 链路为 `NetWorkApi` → `window.yakitBridge.network.axiosApi` → `axios-api` → `${HttpSetting.httpBaseURL}/api/`。
- 企业模式代码地址为 `https://vip.yaklang.com`，本任务不得调用或依赖该服务。
- 项目与数据上传链路依赖引擎 RPC，包括 `GetProjects`、`UploadRiskToOnline` 与 `HTTPFlowsToOnline`。
- 账号和角色入口依赖企业登录用户的 `platform` 与 `role`，客户端显示控制不代表服务端授权。

## 六、技术选择理由

本任务采用文档审计，不修改页面。仓库内没有角色、账号、组织或团队共享业务路由，直接启用入口会把不可验证的外部依赖呈现为已交付能力。现有页面、类型和状态组件保留为阶段六复用基础。

## 七、关键风险点

- 多客户端共享只有上传线索，没有共享读取、冲突处理和权限隔离证据。
- 角色权限模型只显示插件范围，服务端授权无法从当前仓库确认。
- 项目文件夹不等同于服务端团队项目组。
- 密码复杂度正则缺少结尾锚点，初始密码策略由外部服务决定。
- 私有域密码使用可逆 Base64 保存，与序号 30 的目标冲突。
- 开发模式会选择或调用外部地址，本阶段没有动态查看证据。
