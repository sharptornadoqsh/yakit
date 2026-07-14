# 睿眼自动化渗透系统阶段七移交

## 一、阶段结果

客户端已复用用户启动的外部账号服务，服务登录、当前用户、用户管理列表和角色与权限列表均完成开发态验证。仓库内没有新增账号服务、模拟数据、团队工作区或共享项目能力。

关键适配包括标准响应解析、服务根地址规范化、地址变化后的会话清理、本地退出保证、管理员页面权限门槛、服务权限字段展示、角色详情值序列化，以及六组用户可见名称统一。

## 二、修改范围

- 主侧 HTTP 与会话：`app/main/httpServer.js`、`app/main/state.js`、`app/main/handlers/userInfo.js`
- 登录退出：`app/renderer/src/main/src/utils/login.tsx`
- 用户与角色页面：`app/renderer/src/main/src/pages/loginOperationMenu/AccountAdminPage.tsx`、`app/renderer/src/main/src/pages/loginOperationMenu/RoleAdminPage.tsx`
- 用户角色展示与菜单名称：`app/renderer/src/main/src/pages/MainOperator.tsx`、`app/renderer/src/main/src/pages/main.scss`、`app/renderer/src/main/src/components/layout/FuncDomain.tsx`
- 路由名称：`app/renderer/src/main/src/routes/newRoute.tsx`
- 多语言资源：`app/renderer/src/main/public/locales/{zh,en,zh-TW}/{components,core,layout,yakitRoute}.json`
- 阶段文档：`docs/renyan/EXTERNAL_ACCOUNT_SERVICE.md`、`docs/renyan/CURRENT_HANDOFF.md`、`docs/renyan/IMPLEMENTATION_STATUS.md`

没有改动协议定义、数据库、引擎、许可证判断、构建配置或服务端仓库。

## 三、动态查看结果

| 页面或状态 | 查看内容 | 结果 |
| --- | --- | --- |
| 服务登录 | 服务地址、账号、密码、登录请求、错误提示区域 | 登录成功 |
| 当前用户 | 平台、角色、用户标识与令牌存在性 | 管理员状态有效 |
| 管理员菜单 | 用户名称、管理员角色、用户管理、角色与权限 | 名称与角色显示有效 |
| 用户管理 | 组织结构、账号列表、角色、创建时间、管理按钮 | 读取到一条服务记录 |
| 角色与权限 | 内置角色列表、操作权限、创建时间、管理按钮 | 读取到三条服务记录 |

角色列表包含三类内置角色。服务数据未给这些角色返回插件操作权限，页面权限列显示 `-`。动态查看未见致命脚本异常或横向溢出。

## 四、契约结论

- 服务根地址由客户端统一转换为单一 `/api/` 基址。
- 登录使用 `POST /api/urm/login`，密码在客户端生成 MD5 后提交。
- 用户 API 为 `/api/urm`、`/api/urm/edit` 与 `/api/urm/reset/pwd`。
- 角色 API 为 `/api/roles` 与 `/api/roles/detail`。
- 服务响应采用 `{code,message,data}`，令牌原值写入 `Authorization`。
- 地址变化、用户退出或认证失效会清理本地会话。

完整说明见 `docs/renyan/EXTERNAL_ACCOUNT_SERVICE.md`。

## 五、未验证范围

- 只有管理员账号可用，非管理员页面与多角色权限差异没有动态证据。
- 没有主动制造离线、错误密码、令牌过期或服务地址变化。
- 没有提交用户或角色创建、编辑、删除与密码重置，外部服务数据保持原状。
- 本地配置采用可逆 Base64 编码，服务端密码存储方式未知。
- 团队工作区、共享项目、多客户端协作与服务端安全总览不属本阶段交付。
- 没有启动全量测试、全量类型检查、全量规则检查、构建、打包、跨平台验证或性能测试。

## 六、复验资料

动态截图保存在本机临时目录，没有纳入仓库。截图与文档均未记录真实密码、完整令牌或服务内账号详情。

最终本地验证限定为分支名称、差异空白与工作区状态。提交目标仅为 `qsh`，`master` 保持原状。
