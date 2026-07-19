# 睿眼登录后界面组件清单

## 全局框架

| 能力 | 当前实现 | 状态 | 约束 |
| --- | --- | --- | --- |
| 应用框架 | `RuiYanAppShell` | 已完成 | 顶栏、深色导航、工作区和状态栏尺寸统一变量化 |
| 顶部命令栏 | `RuiYanTopCommandBar` | 已完成 | 保留搜索、真实命令、消息和账户入口 |
| 一级导航 | `RuiYanPrimaryNav` | 已完成 | 深蓝灰固定区域 |
| 二级导航 | `RuiYanSecondaryNav` | 已完成 | 只显示真实可调用入口 |
| 页面标题与面包屑 | `RenyanPageHeader`、`RuiYanBreadcrumb` | 已完成 | 不改变业务页挂载方式 |
| 底部状态栏 | `RenyanStatusBar` | 已完成 | 三十二像素深色状态栏，不遮挡内容 |
| 底部任务中心 | `RenyanTaskCenter` | 已完成 | 消费真实任务来源并从状态栏向上展开 |
| 顶部消息中心 | `MessageCenterPanel` | 已完成 | 保留分页、已读、清理和任务导入逻辑 |

## 公共原语

`components/renyanUI/RuiYanPrimitives.tsx` 已提供按钮、图标按钮、卡片、面板、工具栏、表格、面包屑、分段控件、页签、状态标签、指标卡、空状态、弹窗、抽屉和确认框。浮层已具备退出键、焦点循环、焦点恢复及遮罩关闭行为。

下拉菜单、提示、气泡卡片、通知、消息、模态框、抽屉和加载状态通过登录后外壳挂载期间的页面作用域统一。旧页面继续依赖第三方组件与既有 Yakit 封装时，通过主题作用域和局部适配形成一致外观，不批量改写业务逻辑。登录方式弹窗与企业服务地址配置由作用域选择器明确排除，保持任务基线中的界面结构。

## 设计变量

统一变量集中于 `theme/renyan.scss`，覆盖窗口标题栏高度、导航宽度、顶部栏高度、底部栏高度、页面间距、面板内边距、圆角、表格行高、主色、状态色、边框、工作区、表面、正文和次级文字。业务页面不得自行创建同义颜色和尺寸变量。

| 变量 | 当前值或组成 | 用途 |
| --- | --- | --- |
| `--ruiyan-shell-sidebar-width` | `220px` | 一级与二级导航总宽度 |
| `--ruiyan-shell-primary-width` | `64px` | 一级导航宽度 |
| `--ruiyan-shell-secondary-width` | `156px` | 二级导航宽度 |
| `--ruiyan-window-chrome-height` | `32px` | 窗口标题栏高度 |
| `--ruiyan-shell-topbar-height` | `52px` | 顶部工具栏高度 |
| `--ruiyan-shell-status-height` | `32px` | 底部状态栏高度 |
| `--ruiyan-shell-content-top` | 标题栏与工具栏高度之和 | 门户浮层顶部边界 |
| `--ruiyan-page-gap` | `16px` | 页面主间距 |
| `--ruiyan-panel-padding` | `16px` | 内容面板内边距 |
| `--ruiyan-table-row-height` | `38px` | 高密度表格行高 |
| `--ruiyan-radius-sm` | `2px` | 输入框、按钮与紧凑控件圆角 |
| `--ruiyan-radius-md`、`--ruiyan-radius-lg` | `4px` | 面板、弹窗与抽屉圆角 |
| `--ruiyan-color-primary`、`--ruiyan-color-on-primary` | `#1d63b3`、`#ffffff` | 主操作及其前景色 |
| `--ruiyan-color-nav`、`--ruiyan-color-nav-panel` | `#102a44`、`#163550` | 两级导航表面 |
| `--ruiyan-color-nav-active`、`--ruiyan-color-nav-indicator` | `#1c5fa8`、`#8ec2f3` | 导航选中状态 |
| `--ruiyan-color-success`、`--ruiyan-color-warning`、`--ruiyan-color-danger` | 绿色、橙色、红色状态变量 | 状态与风险语义 |
| `--ruiyan-color-background`、`--ruiyan-color-surface` | `#f2f4f7`、`#ffffff` | 工作区与内容面板表面 |

## 真实数据与协议边界

- HTTP 代理与历史流量继续使用现有远程过程调用、进程间通信、事件和数据结构。
- 扫描继续使用现有插件选择、任务创建、流式进度与结果查询链路。
- 插件中心保留本地进程间通信与线上网络请求两套来源。
- 消息中心保留现有消息查询、已读、清理、套接字刷新和任务通知 Hook。
- 证书管理保留字节数组、容器格式和证书格式校验。
- 报告继续使用已有生成接口和报告编号，不创建浏览器侧报告数据。

## 测试入口

现有参考测试包括 `renyanMenu.test.ts`、`RenyanNavigation.test.tsx`、`RuiYanPrimitives.test.tsx` 和 `RenyanWindowChrome.test.tsx`。本次新增 `RuiYanVisualContext.test.ts`、`RuiYanShell.test.tsx` 与 `RenyanTaskCenter.test.tsx`，覆盖路由视觉映射、登录后浮层作用域、真实任务读取、状态转换、面板开关和消息中心联动。
