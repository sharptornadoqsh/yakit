# 项目上下文摘要（睿眼产品化阶段二）

生成时间：2026-07-13 22:54:55 +08:00

## 一、目标、范围与验收契约

- 目标：仅改造主渲染应用外壳、导航层级、工作台首页、主题、菜单元数据与统一可见状态，不改核心功能页内部协议和数据模型。
- 输入：`功能要求.xls` 的功能性序号一至二十四、阶段一文档基线、现有 `YakitRoute` 枚举、菜单事件与首页查询接口。
- 输出：配置化菜单模型、路由显示映射、统一导航与工作区外壳、真实数据工作台、双主题、状态组件、单元测试、运行证据与阶段二文档。
- 验收：七个一级菜单按目标顺序展示；默认隐藏序号十一、十五、十七、二十四；序号二十五不建立菜单；所有保留路由仍可由内部事件打开；首页不以常量伪造数量；三语键一致；浅色和深色均可读。

## 二、相似实现分析

### 实现一：路由元数据与页面分发

- 位置：`app/renderer/src/main/src/routes/newRoute.tsx`、`app/renderer/src/main/src/enums/yakitRoute.ts`
- 模式：`YakitRouteToPageInfo` 保存路由显示信息，`RouteToPage` 按既有枚举分发页面，`SingletonPageRoute` 与 `NoPaddingRoute`控制标签页和页面布局。
- 可复用：现有 `YakitRoute` 值、页面分发、标签页事件和无内边距清单。
- 约束：不得修改任何既有枚举值；睿眼名称通过独立显示映射覆盖，不改变路由键和内部事件载荷。

### 实现二：公开版与私有版菜单

- 位置：`app/renderer/src/main/src/pages/layout/publicMenu/PublicMenu.tsx`、`app/renderer/src/main/src/pages/layout/HeardMenu/HeardMenu.tsx`
- 模式：公开版和私有版均接受页面选择回调与路由名称映射回调；旧实现还负责数据库自定义菜单、插件下载和历史兼容。
- 可复用：`RouteToPageProps`、`onMenuSelect`、`onRouteMenuSelect`、`setRouteToLabel` 与事件打开页链路。
- 约束：旧实现作为兼容显示层保留引用，睿眼菜单作为当前显示层；不得删除插件执行、菜单数据库和内部跳转逻辑。

### 实现三：标签页工作区

- 位置：`app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.tsx`、`renderSubPage/RenderSubPage.tsx`
- 模式：一级标签、二级标签和路由页面由 `TabContent`、`TabChildren`、`RenderSubPage` 分层渲染；当前路由由 `PageCache` 提供。
- 可复用：现有标签缓存、页面打开回调、页面容器和路由标题。
- 约束：页头与侧边栏只包裹现有工作区，不改变页面参数、标签缓存结构和页面组件协议。

### 实现四：整体布局与状态

- 位置：`app/renderer/src/main/src/components/layout/UILayout.tsx`、`GlobalState.tsx`、`FuncDomain.tsx`
- 模式：`UILayout` 管理引擎连接、项目选择、桌面窗口头部和主工作区；更新、关于与项目切换已有界面事件。
- 可复用：`engineLink`、`engineMode`、`onUIOpSettingMenuSelect`、现有更新弹层与关于弹层。
- 约束：底部状态区只消费现有连接状态；不新增引擎通信，不触碰引擎改造。

### 实现五：首页真实指标

- 位置：`app/renderer/src/main/src/pages/home/Home.tsx`
- 模式：当前项目使用 `GetCurrentProjectEx`，历史流量使用 `QueryHTTPFlows`，风险等级使用 `QueryAvailableRiskLevel`。
- 可复用：三个既有查询及 `menuOpenPage`、`openPage`、项目切换事件。
- 约束：初始值使用未知状态；查询成功后才显示数字；查询失败显示错误状态；团队服务仅显示“待团队阶段实现”。

## 三、依赖与集成点

```text
product/renyan.json
  -> utils/envfile.tsx/GetMainColor
  -> useTheme
  -> 现有颜色变量与阶段二外壳样式

routes/renyanMenu.ts
  -> RenyanNavigation
  -> PublicMenu / HeardMenu 的当前显示层
  -> MainOperatorContent 的可折叠侧边栏与页面标题
  -> 既有 onMenuSelect
  -> MainOperatorContent
  -> RouteToPage

Home.tsx
  -> GetCurrentProjectEx
  -> QueryHTTPFlows
  -> QueryAvailableRiskLevel
  -> homeMetrics.ts
  -> 真实项目、流量与风险概览

UILayout.tsx
  -> engineLink / engineMode
  -> RenyanStatusBar
```

## 四、项目约定

- 命名：组件与类型使用大驼峰，函数和变量使用小驼峰，钩子以 `use` 开头，常量可使用全大写下划线。
- 文件：测试与被测模块相邻放入 `__test__`；样式使用模块化样式表；主渲染代码保留在既有目录。
- 格式：两空格、单引号、无分号、尾逗号、每行不超过一百二十字符。
- 注释：只说明意图、约束和边界，不写开发过程说明。
- 国际化：可见文案写入简体中文、英文和繁体中文三个同名资源文件。

## 五、可复用组件与接口

- `RouteToPageProps`：保持菜单选择回调协议。
- `YakitRoute`：保持全部现有路由值。
- `YakitRouteToPageInfo`：作为未知路由标题的兼容来源。
- `emiter`：复用 `menuOpenPage`、`openPage` 与 `onUIOpSettingMenuSelect`。
- `YakitSpin`、`YakitButton`：统一状态和操作控件。
- `useTheme` 与现有颜色变量：维持浅色、深色切换协议。

## 六、测试策略

- 框架：Vitest，直接导入纯函数并使用 `describe`、`it`、`expect`。
- 菜单测试：七组顺序、路由显示映射、能力过滤、四个默认关闭标志、团队预览状态、序号二十五缺席。
- 首页指标测试：风险等级别名、空数组、未知等级、字符串数字和总数计算。
- 集成验证：路由枚举可达、隐藏项不出现在生成菜单、旧路由仍存在、页面标题更新、构建通过。
- 动态验证：Electron 启动、首页、一级菜单、二三级菜单、关于入口与隐藏菜单断言；截图写入阶段二证据目录。

## 七、技术选择与风险

- 采用纯数据菜单生成函数和薄显示组件，不新增路由框架或状态依赖。
- 公开版与私有版共用同一睿眼显示模型，旧菜单实现继续保留引用，降低内部菜单能力回归风险。
- 页头嵌入现有标签页容器，侧边栏包裹标签工作区，必须验证无内边距页面与多标签页尺寸。
- 关于与更新入口通过已有组件的本地界面事件打开，不新增主侧通信名称。
- 当前工具集没有顺序思考、任务管理器、桌面文件管理器和文档检索接口；使用会话计划、代码图、有界文本检索、本地命令与完整验证代替。

## 八、上下文充分性检查

- 已定义接口契约：是；菜单输入为功能标志和能力集合，输出为排序后的显示树。
- 已理解技术选择：是；复用现有路由和事件，新增纯显示映射。
- 已识别主要风险：是；页面尺寸、旧菜单兼容、路由可达、双主题和真实数据状态。
- 已确定验证方式：是；纯函数单元测试、全量静态检查、构建、Electron 冒烟与人工复验记录。
