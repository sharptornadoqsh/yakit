# 项目上下文摘要（Actions 下拉框 never 类型）

生成时间：2026-07-27 01:35:43 +08:00

## 一、问题位置

- 错误位于 `HubListTeamComponent.test.tsx` 的 `antd.Select` 测试模拟。
- `options = []` 缺少元素类型，生产构建检查 `src` 下测试文件时将其推断为 `never[]`。
- 同一模拟中的 `dataSource = []` 具有相同风险，当前错误消除后可能成为下一处失败。

## 二、相似实现

- `EnterpriseJudgeLogin.test.tsx` 为模拟组件的解构参数声明完整内联类型。
- `AddYakitPlugin.test.tsx` 为 `forwardRef` 模拟组件和按钮模拟组件声明明确属性类型。
- `LoginRequiredState.test.tsx` 为模拟状态组件声明 `ReactNode`、字符串和回调类型。

## 三、项目约定与复用

- 使用 React 既有 `ReactNode` 与 `Key` 类型描述模拟数据，不引入新依赖。
- 保留 Vitest、Testing Library 和当前 `vi.mock` 结构。
- 修改范围仅限测试模拟的数组元素类型及任务记录。

## 四、验证策略

- 执行 `HubListTeamComponent.test.tsx` 的定向 Vitest。
- 执行 `git diff --check` 和 Prettier 校验。
- 遵守用户约束，不执行 Yakit 构建、TypeScript 类型检查或打包；最终类型验证由 GitHub Actions 完成。

## 五、风险

- Vitest 使用转译执行，不提供完整 TypeScript 语义检查。
- 通过同时标注 `options` 与 `dataSource`，消除该测试模拟内已发现的两处空数组 `never[]` 推断。
- Context7 当前不可用；本次依据仓库 TypeScript 配置、现有测试模式和编译诊断实施。
