# 睿眼产品化架构图

## 阶段一：产品身份与构建适配

## 一、单一配置与适配关系

| 层次 | 入口 | 输入 | 职责 |
| --- | --- | --- | --- |
| 产品配置源 | `product/renyan.json` | 产品名称、应用标识、产物名、数据目录、更新通道、支持方、版权和颜色 | 作为产品身份的唯一可编辑数据源 |
| 构建适配 | `product/build.js` | 构建环境、当前提交、产品类别和许可证要求 | 生成构建提交标识与版本类别，免许可证企业版输出“企业版（免许可证）” |
| 应用主侧适配 | `app/main/product.js` | 产品配置、应用数据根目录、操作系统 | 校验必填字段，设置应用名称、用户目录和系统应用标识 |
| 主渲染适配 | `app/renderer/src/main/src/config/product.ts` | 产品配置、构建注入值 | 向页面标题、主题、品牌组件与关于界面提供只读类型化数据 |
| 启动渲染适配 | `app/renderer/engine-link-startup/src/config/product.ts` | 产品配置 | 向启动标题、主题、标志和说明文字提供只读类型化数据 |
| 打包适配 | `packageScript/electron-builder.config.js` | 产品配置、构建适配 | 配置应用标识、可执行文件、产物名、快捷方式、平台元数据、图标和法律资源 |
| 品牌生成 | `product/scripts/generate_brand_assets.py` | 产品配置、原创几何定义 | 生成矢量源、位图、多尺寸图标、启动资源及平台打包图标 |

三个运行端适配均直接引用 `product/renyan.json`。构建提交与版本类别由 `product/build.js` 派生，未复制产品字段，也未在界面组件中维护第二份产品常量。

## 二、应用主侧初始化次序

1. `app/main/index.js` 取得应用对象并调用 `configureApplicationIdentity`。
2. 应用名称设置为“睿眼自动化渗透系统”，Windows 应用标识设置为 `io.github.sharptornadoqsh.renyan`。
3. 用户目录设置为系统应用数据根目录下的 `RenYan-Pentest`，随后才载入路径、缓存、日志和窗口模块。
4. 主窗口与引擎启动窗口使用产品标题和原创方形图标。
5. 系统菜单、托盘与关于窗口在应用就绪后注册，退出路径统一销毁托盘并关闭日志句柄。

## 三、窗口与桌面集成

| 集成点 | 文件 | 行为 |
| --- | --- | --- |
| 主窗口 | `app/main/index.js` | 使用产品标题、原创图标和独立窗口状态文件 |
| 引擎启动窗口 | `app/main/index.js` | 使用产品标题与原创图标，保留原引擎启动通信 |
| 页面标题 | 两个渲染项目的 `main.tsx` 或 `index.tsx` | 从适配层设置 `document.title` |
| 系统菜单 | `app/main/menu.js` | 提供产品关于入口、分支项目入口、问题反馈与上游开源文档入口 |
| 托盘 | `app/main/tray.js` | 显示主窗口、隐藏、打开日志根目录、关于、退出 |
| 主侧关于窗口 | `app/main/about.*` | 显示客户端、引擎、构建、类别、许可证和第三方通知 |
| 渲染端关于界面 | `HelpDoc.tsx` | 使用同一产品配置和构建注入值，显示免许可证企业版类别 |

托盘的日志入口打开 `getYakitHome()`。该目录是 `engine-log`、`render-log` 与 `print-log` 的共同父目录，可从一个入口访问三类日志。

## 四、数据目录

默认目录结构如下：

```text
%APPDATA%\RenYan-Pentest\
├── config.json
├── renyan-window-state.json
└── projects\
    ├── engine-log\
    ├── render-log\
    ├── print-log\
    ├── auth\
    └── ...
```

应用不探测、不复用、不迁移旧产品目录。既有 `YAKIT_HOME` 环境变量和配置字段仅作为显式兼容入口保留；没有显式配置时，数据始终位于睿眼专属目录。

## 五、构建集成

主渲染器的构建配置注入 `REACT_APP_RENYAN_BUILD_SHA` 与 `REACT_APP_RENYAN_EDITION`。企业版免许可证开发构建由 `REACT_APP_PLATFORM=enterprise` 和 `REACT_APP_REQUIRE_ENTERPRISE_LICENSE=false` 解析为“企业版（免许可证）”。启动渲染器通过 Vite 别名读取同一产品配置。

最终界面验证采用 `yarn build-renders-test-enterprise-no-license`。本次最新要求不生成安装程序，开发输出分别位于 `app/renderer/pages/main` 与 `app/renderer/engine-link-startup/dist`。

## 六、兼容边界

用户可见产品名称、窗口、菜单、托盘、关于信息、默认图标和启动资源使用睿眼身份。通信通道、路由枚举、数据库名称、插件接口、引擎文件协议、更新请求兼容值及 Yaklang 语言名称保持原值。相关残留分类见 `KNOWN_ISSUES.md`。

## 阶段二：应用外壳与导航

### 一、分层关系

| 层次 | 入口 | 输入 | 输出与职责 |
| --- | --- | --- | --- |
| 菜单定义层 | `routes/renyanMenu.ts` | 既有 `YakitRoute`、能力集合、功能标志 | 生成有序菜单树、显示名称映射、路由路径及可导航状态 |
| 顶部导航层 | `pages/layout/renyanMenu/RenyanNavigation.tsx` | 菜单树、原菜单选择回调 | 呈现一级、二级和三级导航；动作型入口复用既有设置事件 |
| 工作区外壳层 | `MainOperatorContent.tsx` | 当前页缓存、当前路由、原页面打开函数 | 组合可折叠侧边栏、页签区、页面标题区与主工作区 |
| 页面标题层 | `RenyanPageHeader.tsx` | 当前路由、菜单路径、产品配置 | 生成标题、面包屑、操作区与浏览器标题 |
| 全局状态层 | `UILayout.tsx`、`RenyanStatusBar.tsx` | 既有引擎连接布尔值与引擎模式 | 呈现引擎状态、运行模式、团队服务阶段状态及产品短名 |
| 工作台层 | `pages/home/Home.tsx` | 三个既有只读查询结果 | 呈现快捷入口、项目、流量、风险、引擎和团队概览 |
| 状态原语层 | `components/yakitUI/RenyanState` | 状态类型、可选说明与重试动作 | 统一空数据、读取中、错误、无权限及离线呈现 |
| 主题适配层 | `utils/envfile.tsx`、`hook/useTheme/index.tsx` | 产品类别与当前浅色或深色模式 | 先为企业、精简企业和社区类别选择睿眼浅深主色，再向文档根节点写入主色和状态色，使页面、浮层与对话框共享同一变量 |

### 二、导航数据流

```text
RENYAN_MENU_MODEL
  → 功能标志与能力过滤
  → 有序菜单树
  ├─ 顶部一级与上下文导航
  ├─ 工作区侧边栏
  ├─ route → 用户可见名称映射
  └─ route → 面包屑路径

菜单选择
  → 既有 onMenuSelect / openMultipleMenuPage
  → 既有页面缓存与路由解析
  → 原功能页面
```

显示映射不修改 `YakitRoute` 的值。页面打开仍进入既有 `RouteToPage` 和页签缓存机制；隐藏项只从菜单树过滤，不影响代码中的内部路由调用。页面标题区只呈现映射后的名称，不显示内部路由键。

### 三、工作台数据流

| 指标 | 查询来源 | 映射规则 | 无数据行为 |
| --- | --- | --- | --- |
| 当前项目 | `GetCurrentProjectEx` | 读取项目名与数据库文件大小 | 缺少项目名时显示真实空状态；缺少大小时显示数据源未报告 |
| 历史流量 | `QueryHTTPFlows` | 限定代理、扫描和基础爬虫来源，只读取总数 | 查询成功且总数为零时显示无流量状态 |
| 风险概览 | `QueryAvailableRiskLevel` | 汇总服务返回的有效风险级别总数并保留分级明细 | 查询成功且总数为零时显示无风险状态 |
| 引擎状态 | `UILayout` 的既有连接状态 | 工作台只在引擎会话可用时呈现，底部状态区直接读取连接值 | 连接中断时由原加载页与底部离线状态表示 |
| 团队服务 | 菜单交付元数据 | 固定显示阶段状态，不提供数量 | 显示“待团队阶段实现”且禁用入口 |

### 四、主题边界

产品身份主色仍由 `product/renyan.json` 提供。`useTheme` 在浅色与深色模式切换时，将蓝色主色、青绿色成功色、黄色警告色和红色错误色写入文档根节点的既有主题变量；页面、浮层和对话框因此使用同一色系。阶段二没有逐页改写核心功能页面样式，也没有改变业务组件的数据与协议。

### 五、兼容边界

`PublicMenu` 与 `HeardMenu` 保留旧实现并通过外壳开关选择睿眼导航。关于、项目管理与引擎更新复用既有事件及弹层。阶段二没有新增进程间通信名称、远程过程调用名称、数据库字段或引擎协议。
