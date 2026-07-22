# 睿眼项目与品牌外观实施计划

> 执行者须按测试驱动方式逐项实施，每项均包含失败验证、最小实现与成功验证。

**目标：** 完成项目入口文案、极简项目管理界面、默认数据库睿眼命名及外部品牌复查。

**架构：** 产品配置提供数据库名称；独立主进程模块负责无损迁移；项目管理纯函数负责默认项目展示规范化；现有睿眼公共组件承担弹层和操作控件。

**技术栈：** Electron、React、TypeScript、SCSS 模块、Vitest。

## 全局约束

- 工作分支必须为 `qsh`。
- 不覆盖工作区已有无关修改。
- 所有文件编辑使用 `apply_patch`。
- 内部类型、缓存键和引擎通信键保持兼容。
- 数据库迁移不得覆盖或删除文件。

## 任务一：默认数据库名称与迁移

**文件：**

- 修改：`product/renyan.json`
- 新建：`app/main/defaultDatabase.js`
- 修改：`app/main/handlers/yakLocal.js`
- 修改：`app/main/product.js`
- 修改：`app/main/__test__/product.test.js`

**接口：**

- `getDefaultDatabaseName(edition)` 返回社区版或企业版数据库名。
- `migrateLegacyDefaultDatabases(directory)` 返回改名记录数组。

- [ ] 在产品测试中加入数据库名称和三类 SQLite 文件迁移断言。
- [ ] 执行定向测试，确认因字段与模块缺失而失败。
- [ ] 增加产品配置、迁移模块及主进程调用。
- [ ] 再次执行定向测试，确认测试成功。

## 任务二：默认项目展示与入口文案

**文件：**

- 新建：`app/renderer/src/main/src/pages/softwareSettings/projectBranding.ts`
- 新建：`app/renderer/src/main/src/pages/softwareSettings/__test__/projectBranding.test.ts`
- 修改：`app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx`
- 修改：`app/renderer/src/main/src/components/layout/UILayout.tsx`
- 修改：`app/renderer/src/main/public/locales/zh/layout.json`
- 修改：`app/renderer/src/main/public/locales/zh-TW/layout.json`
- 修改：`app/renderer/src/main/public/locales/en/layout.json`

**接口：**

- `getProjectDisplayText(projectName, value)` 仅规范化默认项目中的旧品牌片段。

- [ ] 编写纯函数测试，覆盖默认项目、普通项目、空值与大小写。
- [ ] 执行测试，确认模块缺失导致失败。
- [ ] 实现纯函数并用于列表、详情与路径展示。
- [ ] 修改入口确认文案与睿眼弹层标题。
- [ ] 再次执行定向测试，确认测试成功。

## 任务三：项目管理极简视觉

**文件：**

- 修改：`app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx`
- 修改：`app/renderer/src/main/src/pages/softwareSettings/ProjectManage.module.scss`
- 修改：`app/renderer/src/main/src/components/layout/uiLayout.module.scss`

- [ ] 在产品测试中加入项目弹层结构与关键样式契约。
- [ ] 执行测试，确认旧结构不满足契约。
- [ ] 移除重复标题，合并统计与搜索，压缩操作区与分组栏。
- [ ] 执行样式编译、定向测试和页面截图复查。

## 任务四：品牌外观验证

**文件：**

- 修改：`app/main/__test__/product.test.js`
- 更新：`.claude/operations-log.md`
- 更新：`.claude/verification-report.md`

- [ ] 验证睿眼图标、名称、关于页面、安装配置和用户数据目录。
- [ ] 执行主进程与渲染端定向测试。
- [ ] 执行类型检查、主渲染构建与差异检查。
- [ ] 同步代码图并依据受影响范围执行相关测试。
- [ ] 写入评分、风险与本地验证结果。
