# 睿眼产品化阶段一架构图

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
