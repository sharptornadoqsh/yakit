# 项目上下文摘要（睿眼前端产品级重构）

生成时间：2026-07-16 21:50:04 +08:00

## 一、目标、范围与验收条件

本任务依据 `D:\Desktop\Project\yakit围标\功能要求.xls`、视觉目录中的六张图片和目标文件完成睿眼前端产品级重构。六张图片中有两张摘要完全相同，因此视觉依据为五张独立设计板。任务保留现有路由键、状态、事件、接口、进程间通信、远程过程调用与引擎调用，重写全局框架、菜单信息架构、公共组件、主要页面组合、图标和状态资源。

验收条件如下：

- 当前分支保持 `qsh`，远端保持 `https://github.com/sharptornadoqsh/yakit.git`。
- 一级导航固定为工作台、交互代理、流量中心、漏洞检测、爆破测试、报文工具、插件中心、团队协作、项目与安全、系统设置。
- 全局框架形成顶部命令栏、左侧一级导航、二级导航、页面标题、独立工具区、内容工作区和详情区。
- `components/renyanUI` 提供目标文件列出的公共组件，组件使用独立结构、类名、视觉变量和交互状态。
- 星号需求及其连续子项全部保留；指定非星号功能继续使用现有真实业务组件和调用。
- 未实现或依赖外部服务的入口只能显示真实交付状态或保持隐藏，不建立静态占位页面，不伪造数据。
- 不修改后端、引擎协议、外部服务协议、许可证判断、主分支、工作树体系或远程工作流。
- 不启动桌面应用、浏览器、开发服务，不执行构建、打包和全量检查。
- 最终只执行限定静态检查，以及 `git branch --show-current`、`git diff --check`、`git status --short`。
- 不执行暂存、提交、推送、标签和合并请求操作。

## 二、需求源与视觉源

- 工作簿：`D:\Desktop\Project\yakit围标\功能要求.xls`，传统二进制工作簿，一张有效工作表，三十一项编号需求。
- 星号小类：流量交互劫持能力、报文修改重放能力、团队协作或共享能力、安全性要求。
- 视觉目录：`D:\Desktop\Project\yakit围标\yakit图片`。
- 独立视觉板：工作台与设计变量、漏洞检测与爆破、报文工具与编解码、插件与项目安全、团队权限与安全设置。
- 视觉方向：深海军蓝导航、浅色工作区、冷蓝与青绿色状态、清晰留白、模块化分栏、紧凑表格和统一操作层级。

## 三、相似实现分析

- `app/renderer/src/main/src/routes/renyanMenu.ts`
  - 模式：配置化菜单树、能力过滤、功能标志、路由显示映射和动作型入口。
  - 可复用：`buildRenyanMenu`、`findRenyanMenuPath`、`flattenRenyanMenu`、`isRenyanMenuItemNavigable`。
  - 约束：当前仅有七组一级菜单，团队页面被标记为计划状态，无法满足本次十组信息架构。
- `app/renderer/src/main/src/pages/layout/renyanMenu/RenyanNavigation.tsx`
  - 模式：活动路由驱动菜单路径，菜单选择复用原 `onMenuSelect`，设置动作复用原事件总线。
  - 可复用：活动路径同步、路由选择回调、项目、更新、关于动作。
  - 约束：当前采用顶部横向一级菜单和重复侧轨，目标要求改为独立顶栏与左侧一级、二级导航。
- `app/renderer/src/main/src/pages/layout/mainOperatorContent/MainOperatorContent.tsx`
  - 模式：页签缓存与 `openMultipleMenuPage` 是真实页面打开入口，`RuiYanPage` 只包裹展示层。
  - 可复用：当前活动路由、页面缓存、页签切换、路由打开和原页面渲染。
  - 约束：不能重写页签与页面打开协议；新框架必须作为显示层装配。
- `app/renderer/src/main/src/pages/home/Home.tsx`
  - 模式：使用 `GetCurrentProjectEx`、`QueryHTTPFlows`、`QueryAvailableRiskLevel` 读取真实指标，并区分读取中、错误和空数据。
  - 可复用：查询函数、请求序号防竞态、真实空状态和既有路由打开事件。
  - 约束：当前工作台以快捷入口为主，缺少效果图中的指标带、趋势、协议分布、近期任务和团队动态结构。
- `app/renderer/src/main/src/pages/compare/DataCompare.tsx`
  - 模式：新命令栏直接调用编辑器实例，左右文本状态与原比较组件保持不变。
  - 可复用：上一处、下一处、交换、清空、换行与双栏编辑器绑定方式。
  - 约束：字节模式证据不足，不能将入口标记为完整实现。
- `app/renderer/src/main/src/pages/securityTool/yakPoC/YakPoC.tsx`
  - 模式：左侧分类和中部执行器由真实状态、组选择、任务恢复和混合扫描调用组成。
  - 可复用：插件组、目标输入、执行状态、历史任务和结果组件。
  - 约束：需要用公共分栏与面板组件组织，不能改变任务恢复与扫描参数。
- `app/renderer/src/main/src/pages/securityTool/newBrute/NewBrute.tsx`
  - 模式：协议选择、任务配置和结果组件均保留原启动、取消、流式结果与字典参数。
  - 可复用：`apiStartBrute`、`apiCancelStartBrute`、`BruteTypeTreeList`、`BruteExecute`。
  - 约束：需要形成协议、配置、结果三段结构，不能拆断流式任务状态。

## 四、依赖与集成点

```text
RENYAN_MENU_MODEL
  -> RuiYanTopCommandBar
  -> RuiYanPrimaryNav
  -> RuiYanSecondaryNav
  -> 原 onMenuSelect / openMultipleMenuPage
  -> 原 PageItem 与业务页面

usePageInfo.currentPageTabRouteKey
  -> 菜单活动路径
  -> 页面标题与模块信息
  -> RuiYanVisualProvider
  -> 目标页面状态资源
```

- 外部依赖：React 18.2、TypeScript 5.1、Sass、Classnames、Vitest、Testing Library。
- 内部依赖：`YakitRoute`、`usePageInfo`、事件总线、`MainOperatorContent`、`RouteToPage`、主题状态、用户状态。
- 配置来源：`product/renyan.json`、`routes/renyanMenu.ts`、`hook/useTheme/index.tsx`。
- 页面数据：保持现有进程间通信、远程过程调用、网络请求和状态存储，不新增模拟接口。

## 五、公共组件设计

- 外壳层：`RuiYanAppShell`、`RuiYanTopCommandBar`、`RuiYanPrimaryNav`、`RuiYanSecondaryNav`。
- 页面层：`RuiYanPage`、`RuiYanPageHeader`、`RuiYanToolbar`、`RuiYanSplitPane`、`RuiYanDetailPanel`。
- 控件层：`RuiYanButton`、`RuiYanIconButton`、`RuiYanTabs`、`RuiYanStatusBadge`。
- 数据层：`RuiYanCard`、`RuiYanPanel`、`RuiYanMetricCard`、`RuiYanDataTable`、`RuiYanFilterPanel`、`RuiYanFormSection`。
- 浮层与状态：`RuiYanDrawer`、`RuiYanModal`、`RuiYanEmptyState`、`RuiYanLoadingState`、`RuiYanErrorState`。
- 组件使用原生语义元素与独立样式模块，不把旧组件原样包在新名称下。

## 六、项目约定

- React 组件、类型和文件名使用大驼峰；函数、变量与属性使用小驼峰。
- TypeScript 与样式采用两个空格、单引号、无分号、尾随逗号和一百二十字符宽度。
- 测试位于相邻 `__test__` 目录，使用 Vitest 与 Testing Library。
- 新增代码标识符使用英文；用户可见文案保持简体中文并优先复用既有翻译键。
- 业务调用、路由键和事件名保持兼容；视觉类名使用 `ruiyan` 前缀并由样式模块隔离。

## 七、测试策略

- 菜单模型：验证十组一级导航顺序、必选路由、隐藏入口、计划状态和现有路由值。
- 全局导航：验证活动路由同步、一级组切换、二级路由打开和动作型入口事件。
- 公共组件：验证按钮状态、标签页选择、表格空状态、弹窗和抽屉关闭语义。
- 工作台：复用现有真实数据映射测试，检查无数据与错误状态，不制造固定指标。
- 页面集成：对改动文件执行格式解析、导入检查、明显未使用变量检查和相邻定向测试。
- 最终只执行目标文件允许的 Git 检查；不执行全量测试、全量规则检查、全量类型检查、构建或应用启动。

## 八、资料来源与用途

- React 官方状态保留文档：确认外壳重组时通过稳定元素位置与键保留业务页面状态。
  - `https://react.dev/learn/preserving-and-resetting-state`
- W3C 对话框模式：约束自有弹窗的角色、标签和关闭行为。
  - `https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/`
- W3C 标签页模式：约束自有标签页的角色、选中状态和面板关联。
  - `https://www.w3.org/WAI/ARIA/apg/patterns/tabs/`
- Ant Design Pro 原始仓库：仅参考顶栏加侧栏的混合导航、路由菜单分离与变量化主题组织。
  - `https://github.com/ant-design/ant-design-pro`

## 九、关键风险

- 视觉范围覆盖多个复杂业务页面，修改顶层组合时必须保持页面实例键与页签缓存稳定。
- 账号、角色和团队共享依赖外部服务；前端入口不能被解释为服务端授权或多人共享已经完整验证。
- 报文差异缺少独立字节模式，插件链路与受管客户端总览缺少完整实现，只能保持隐藏或计划状态。
- 项目管理由 `UILayout` 控制独立显示状态，不能当作普通路由页面重新实现。
- 旧页面体量较大，公共组件迁移必须限定在顶层结构与主要操作区，避免触碰业务参数和请求协议。

## 十、工具说明

CodeGraph 索引有效且为最新状态。当前工具集没有顺序思考、任务管理器、桌面文件管理器、Context7 和远程代码搜索接口；采用结构化计划、CodeGraph、`rg`、电子表格只读接口、官方资料与 `apply_patch` 完成对应工作。远程代码插件安装建议未获确认，因此不作为任务前置条件。
