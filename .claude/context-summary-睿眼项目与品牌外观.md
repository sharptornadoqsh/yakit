# 项目上下文摘要（睿眼项目与品牌外观）

生成时间：2026-07-22 10:43:27 +08:00

## 一、相似实现分析

- `app/renderer/src/main/src/pages/softwareSettings/ProjectManage.tsx`：项目列表、分组、操作区与详情抽屉均在同一业务组件内，现有睿眼公共按钮、弹层和抽屉可继续复用。
- `app/renderer/src/main/src/components/layout/HelpDoc/HelpDoc.tsx`：关于页面通过 `productConfig`、睿眼字标和睿眼弹层呈现产品身份，已经形成集中配置模式。
- `app/renderer/src/main/src/pages/softwareSettings/SoftwareSettings.tsx`：项目设置页根据主题使用睿眼图标与字标，图片替代文本来自 `productConfig.displayName`。
- `app/main/product.js` 与 `product/renyan.json`：应用名称、可执行文件、数据目录、安装产物与品牌颜色由单一配置源提供。
- `app/main/filePath.js`：默认项目目录已经位于系统应用数据目录下的 `RuiYan-Pentest/projects`，旧目录仅能由显式环境配置引用。

## 二、项目约定

- 组件与类型采用大驼峰，函数和变量采用小驼峰；样式类采用短横线命名并通过样式模块引用。
- 源码使用两个空格、单引号、无分号与尾随逗号；测试位于相邻 `__test__` 目录或主进程测试目录。
- 主进程产品身份从 `product/renyan.json` 读取；界面采用 `RuiYanModal`、`RuiYanDrawer` 与 `RuiYanButton`。
- 当前工作分支为 `qsh`。工作树含有用户的登录会话相关修改，本任务不得覆盖这些内容。

## 三、可复用组件清单

- `app/renderer/src/main/src/components/renyanUI/RuiYanPrimitives.tsx`：睿眼按钮、弹层与抽屉。
- `app/renderer/src/main/src/config/product.ts`：渲染端产品配置。
- `app/main/product.js`：主进程产品配置与用户数据目录解析。
- `app/main/filePath.js`：默认项目目录解析。
- `app/main/__test__/product.test.js`：产品名称、图标、关于页面、打包身份与数据目录契约。

## 四、测试策略

- 测试框架为 Vitest；主进程测试使用 Node 文件系统临时目录，渲染端纯函数测试采用输入输出断言。
- 先为数据库名称、无损迁移、默认项目可见文本和项目弹层结构建立失败测试，再实施代码。
- 正常流程覆盖社区版与企业版数据库名；边界流程覆盖目标文件已存在时的归档改名；错误风险通过保留原文件且禁止删除控制。
- 视觉部分采用源码结构契约、样式编译和浏览器截图共同验证。

## 五、依赖与集成点

- `app/main/handlers/yakLocal.js` 通过环境变量 `YAK_DEFAULT_DATABASE_NAME` 把数据库名传给本地引擎。
- `app/renderer/src/main/src/components/layout/UILayout.tsx` 负责项目入口确认框与睿眼项目弹层。
- `ProjectManage.tsx` 从项目服务读取 `Description` 与 `DatabasePath`，列表和详情抽屉均显示这些字段。
- `packageScript/electron-builder.config.js` 使用产品配置生成应用名、可执行文件名、图标和安装快捷方式名称。

## 六、技术选择

- 采用集中产品配置、无损文件改名和默认项目显示规范化。该方案同时覆盖新安装与已有数据库，并保持引擎通信键不变。
- 不采用仅在界面替换文字的方案，因为磁盘文件名仍会保留旧品牌。
- 不采用全仓内部符号改名，因为类型名、缓存键与通信协议属于技术兼容层，不在用户指定范围内。

## 七、关键风险

- 数据库改名必须在本地引擎启动前完成，并同时处理 SQLite 的日志与共享内存附属文件。
- 目标数据库已经存在时不得覆盖；旧数据库改为不含旧品牌的归档名以保留数据。
- 项目详情的显示规范化仅作用于默认项目，避免改写用户自定义项目文案。
- 代码托管搜索因匿名访问频率限制失败；结构化任务管理与编程文档专用服务未提供。已使用代码图、仓库源码、官方 React 文档和本地测试作为替代证据。

## 八、充分性结论

- 接口契约明确：产品配置提供两个数据库名，迁移函数输入目录并返回改名记录，显示函数输入项目名与文本并返回展示值。
- 集成点明确：主进程数据库环境变量、项目管理渲染、关于页面与打包配置均已定位。
- 验证方式明确：定向测试、渲染端类型检查、主渲染构建、代码图同步、品牌残留扫描和截图复查。
