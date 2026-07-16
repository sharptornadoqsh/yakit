# 项目上下文摘要（企业登录页 HTTP 提示优化）

生成时间：2026-07-16 09:18:00 +08:00

## 一、任务边界

- 工作分支为 `qsh`，开始时工作树无改动，CodeGraph 索引有效。
- 优化企业登录页的 HTTP 提示，不调整登录字段、主题选择、提交参数、认证接口或许可证判断。
- 本机回环地址不显示提示；远程 HTTP 地址显示低强调度行内文字；普通设置弹窗保持现有警告组件。

## 二、相似实现分析

### 二点一、企业登录表单

- 文件：`app/renderer/src/main/src/components/ConfigPrivateDomain/ConfigPrivateDomain.tsx`。
- 模式：地址字段通过 `Form.Item shouldUpdate` 监听变化，现有实现对所有 `http://` 地址显示整块警告。
- 可复用：保持表单监听和三语键，仅细分登录页、本机地址与远程地址。

### 二点二、登录页视觉层级

- 文件：`app/renderer/src/main/src/components/ConfigPrivateDomain/ConfigPrivateDomain.scss` 与 `app/renderer/src/main/src/pages/EnterpriseJudgeLogin.module.scss`。
- 模式：次要说明使用十二像素字号和中性次级文本颜色，主题变量同时适配浅色与深色。
- 可复用：行内提示采用相同字号、颜色与间距，不增加背景块、边框或高对比图标。

### 二点三、地址与回环主机判断

- 文件：`app/renderer/src/main/src/utils/tool.ts` 与 `app/main/security.js`。
- 模式：渲染端公共工具集中地址校验，主进程以受信主机集合识别 `127.0.0.1` 与 `localhost`。
- 可复用：在渲染端地址工具中增加纯函数，识别 `localhost`、`127.0.0.0/8` 与 IPv6 回环地址。

### 二点四、测试约定

- 文件：`app/renderer/src/main/src/utils/__test__/passwordPolicy.test.ts` 与 `app/renderer/src/main/src/pages/__test__/EnterpriseJudgeLogin.test.tsx`。
- 模式：纯判断采用 Vitest 表格断言，登录页采用相邻组件测试验证结构和交互。
- 可复用：地址分类使用纯函数单元测试，登录页既有测试继续验证表单页面模式和主题行为。

## 三、依赖与集成点

```text
地址字段值
  → HTTP 协议判断
  → 回环主机判断
  → 登录页远程 HTTP 行内提示
  → 普通设置弹窗原有警告
```

## 四、测试策略

- 实现前增加地址分类用例，使缺失函数形成预期失败。
- 覆盖本机 IPv4、本机 IPv6、本机名称、远程 HTTP、HTTPS 与无效地址。
- 执行地址工具定向测试、企业登录页相邻测试、国际化检查、类型检查、格式与差异检查。
- 当前改动不改变认证请求，不提交真实登录表单。

## 五、上下文充分性检查

- 接口契约明确：输入地址字符串，输出是否需要在登录页显示远程 HTTP 提示。
- 技术选择明确：使用标准 URL 解析和既有主题变量，不引入依赖。
- 风险已经识别：无效地址、IPv6 方括号、普通设置弹窗行为和三语键完整性。
- 验证方式明确：失败回归、纯函数测试、登录页相邻测试、类型与国际化检查。
