# 睿眼自动化渗透系统阶段四交接

## 一、本阶段完成内容

阶段四复用现有代理、重放、扫描、爆破、编解码、插件和项目管理能力，仅整理前端入口与页面呈现。用户可见名称统一为“交互代理”“报文重放”“历史流量”“漏洞检测”“爆破测试”“编解码工具”和“报文差异对比”，内部路由、进程间通信、远程过程调用、数据库字段与底层协议均未改变。

主工作区页面标题现可显示路由说明；目标页面的异步读取、空数据和错误反馈复用统一状态组件。爆破类型列表与编解码方法列表增加读取中、空数据、错误及重试状态。项目管理增加本地项目、加密存储、明文及加密导入导出的页面说明。工作台快捷入口、菜单和页面标题采用同一组用户可见名称。

阶段二已有功能标志继续隐藏报告导出、完整国密算法工具、插件链路编排、服务端安全总览；序号二十五没有菜单节点。相关底层模块未删除。

## 二、修改文件

- 路由与菜单：`app/renderer/src/main/src/routes/newRoute.tsx`、`app/renderer/src/main/src/routes/renyanMenu.ts`、`app/renderer/src/main/src/routes/__test__/renyanMenu.test.ts`
- 页面标题：`app/renderer/src/main/src/components/layout/RenyanPageHeader.tsx`、`app/renderer/src/main/src/components/layout/RenyanPageHeader.module.scss`
- 页面状态：`app/renderer/src/main/src/pages/codec/NewCodec.tsx`、`app/renderer/src/main/src/pages/codec/NewCodec.module.scss`、`app/renderer/src/main/src/pages/securityTool/newBrute/NewBrute.tsx`、`app/renderer/src/main/src/pages/securityTool/newBrute/NewBrute.module.scss`
- 项目管理：`app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx`、`app/renderer/src/main/src/pages/softwareSettings/ProjectManage.module.scss`
- 多语言资源：`app/renderer/src/main/public/locales/{zh,en,zh-TW}/{home,layout,projectManage,yakitRoute}.json`
- 阶段文档：`docs/renyan/CURRENT_HANDOFF.md`、`docs/renyan/IMPLEMENTATION_STATUS.md`

没有删除仓库文件或底层功能模块。

## 三、实际查看的页面

用户手动生成企业版免许可证开发工具界面并启动应用，随后在本地引擎与企业登录态下检查下列页面：

| 页面 | 基础检查 | 结果 |
| --- | --- | --- |
| 项目管理 | 页面说明、项目搜索框焦点、现有默认项目切换 | 可用 |
| 交互代理 | 标题说明、配置区、首个可见控件焦点 | 可用 |
| 历史流量 | 标题说明、流量表、域名搜索框焦点 | 可用 |
| 报文重放 | 标题说明、请求编辑区、结果区、首个可见控件焦点 | 可用 |
| 漏洞检测 | 通用扫描入口、插件区、目标区、首个可见控件焦点 | 可用 |
| 专项漏洞检测 | FastJSON 与 Shiro 分类、目标区、首个可见控件焦点 | 可用 |
| 爆破测试 | 协议列表、目标区、首个可见控件焦点 | 可用 |
| 报文差异对比 | 标题说明、双栏内容区、首个可见控件焦点 | 可用 |
| 编解码工具 | 分类、处理序列、输入输出区、首个可见控件焦点 | 可用 |
| 插件中心 | 本地插件、筛选与管理入口、搜索框焦点 | 可用 |
| 插件开发 | 基础信息、源码、执行结果与日志区域、首个可见控件焦点 | 可用 |

动态检查未发现页面级脚本异常、致命错误状态或横向页面溢出。菜单逐组读取后未发现报告、完整国密算法、插件链路、服务端安全总览或压力测试入口。未使用截图自动化。

## 四、未验证功能

本阶段没有启动真实代理劫持会话，没有修改并转发实际请求或响应，没有执行请求重放、漏洞扫描、爆破任务、编解码转换、插件调试、插件批量导入、项目导入导出或项目加密验证。上述业务能力沿用既有实现，本次仅检查入口与页面基础可用性。

错误状态与重试按钮已通过源码和组件接口检查，但没有人为制造引擎或接口故障。没有执行全量类型检查、全量代码规则检查、全量测试、跨平台检查、安装包生成或性能压力测试。

## 五、已知问题

- 当前动态界面生成于工作台快捷入口文案最终修订之前，因此动态记录中的两张卡片仍显示旧名称；三个语言目录的 `home.json` 已改为“报文差异对比”和“漏洞检测”，本阶段没有再次生成界面。
- 报文重放结果区在未发送请求时保留既有初始提示与读取文案，本阶段没有执行外部请求确认其后续状态。
- 定向测试输出 Vite CommonJS 接口与 `punycode` 模块弃用警告，没有测试失败。
- 仓库已有阶段五协作审计文档及实现状态。本任务依照用户指令仅插入阶段四记录，不改写阶段五审计结论，也未实施阶段五功能。

## 六、下一阶段建议

后续任务应以现有阶段五协作审计为边界，先明确本地可验证的账号、角色、权限与共享项目服务契约，再决定团队入口是否启用。阶段四已保留的代理、重放、扫描、插件和项目管理接口不需要重复实现。
