## 项目上下文摘要（团队插件映射返回类型）

生成时间：2026-07-23 13:37:45 +08:00

### 1. 相似实现分析

- `app/renderer/src/main/src/pages/fuzzer/webFuzzerAiTestTemplateStorage.ts`：持久化函数显式返回 `Promise<void>`，使用 `await setRemoteValue(...)` 保留失败传播。
- `app/renderer/src/main/src/pages/teamCollaboration/teamProjectBundleRuntime.ts`：团队项目映射保存函数等待 `setRemoteValue(...)` 完成，不暴露底层返回值。
- `app/renderer/src/main/src/pages/pluginHub/pluginHubList/HubListTeam.tsx`：相邻的 `saveGroups` 依赖适配器使用异步函数等待底层保存接口，符合副作用回调的无返回值契约。

### 2. 当前契约与问题

- `TeamPluginInstallDependencies.saveMapping` 要求 `(mapping) => Promise<void>`。
- `saveTeamPluginMapping` 直接返回 `setRemoteValue(...)`，其推断类型为 `Promise<unknown>`，因此企业免许可生产构建在依赖赋值处产生 `TS2322`。
- 安装流程只等待映射持久化，不读取保存接口的返回值。

### 3. 修改方案

- 将 `saveTeamPluginMapping` 声明为异步 `Promise<void>` 函数。
- 在函数内部等待 `setRemoteValue(...)`，忽略无业务意义的成功返回值，同时保留拒绝状态和错误对象。
- 不修改通用缓存接口，避免影响其大量既有调用者。

### 4. 测试策略

- 执行团队插件安装、团队列表逻辑和组件契约的相关 Vitest 测试。
- 使用差异检查与格式检查验证目标文件。
- 依照用户要求，不执行 Yakit 编译、生产构建或安装包构建。

### 5. 依赖与风险

- 集成点为 `installTeamPluginDownload` 的 `saveMapping` 依赖。
- 改动不改变缓存键、映射内容、调用顺序或错误传播。
- 本地测试不执行完整 TypeScript 构建；最终生产构建结果由 GitHub Actions 重新执行验证。
