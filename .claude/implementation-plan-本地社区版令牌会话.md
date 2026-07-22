# 本地社区版令牌会话实施计划

> **执行要求：** 使用测试驱动开发与完成前验证技能逐项实施。本计划在当前 `qsh` 分支内执行，不建立额外工作树，也不委派子任务。

**目标：** 让社区版账号在单次应用启动期间仅完成一次登录，令牌过期后保留界面登录状态并静默过期通知；应用重新启动后恢复登录能力，企业账号维持既有失效退出行为。

**架构：** 主进程依据当前账号平台决定四百零一是否保留 `USER_INFO`，并把决定作为响应字段交给渲染进程。渲染进程维护仅存在于当前模块实例的通知静默状态；布局钩子统一三个登录触发来源并根据 `isLogin` 拒绝重复开启。

**技术栈：** Electron、React、TypeScript、JavaScript、Vitest、测试库、Mitt。

## 全局约束

- 变更限定于本地社区版会话行为；`company` 平台维持现状。
- 请求错误仍须拒绝，禁止伪造成功数据。
- 不增加依赖，不改登录窗口内容，不改持久令牌存储协议。
- 所有生产代码改动均由失败测试驱动。

---

### 任务一：主进程会话过期策略

**文件：**

- 修改：`app/main/__test__/state.test.js`
- 修改：`app/main/state.js`
- 修改：`app/main/httpServer.js`

**接口：**

- 输入：`USER_INFO.isLogin`、`USER_INFO.platform` 与服务端四百零一响应。
- 输出：社区账号保留当前内存用户对象；渲染响应包含 `keepLoginOnTokenExpiration`；企业账号和未登录状态清空对象。

**设计内容：**

```javascript
const resolveUserInfoOnTokenExpiration = () => {
  const userInfo = { ...USER_INFO, token: null }
  const keepLoginOnTokenExpiration = USER_INFO.isLogin && USER_INFO.platform !== 'company'
  if (!keepLoginOnTokenExpiration) resetUserInfo()
  return { userInfo, keepLoginOnTokenExpiration }
}

const expireUserInfo = () => resolveUserInfoOnTokenExpiration().userInfo
```

- [ ] 写入社区、企业、未登录三项状态测试。
- [ ] 执行 `yarn test:vitest --run app/main/__test__/state.test.js`，确认社区保留用例因当前无条件清空而失败。
- [ ] 修改 `expireUserInfo`，仅在当前账号未登录或平台为 `company` 时调用 `resetUserInfo`，返回快照中的 `token` 始终为 `null`。
- [ ] 在响应拦截器中恢复 `expireUserInfo` 调用，并附加 `keepLoginOnTokenExpiration`。
- [ ] 再次执行定向测试并确认三项状态均成功。

### 任务二：渲染进程过期通知策略

**文件：**

- 新建：`app/renderer/src/main/src/services/tokenExpirationSession.ts`
- 新建：`app/renderer/src/main/src/services/__test__/tokenExpirationSession.test.tsx`
- 修改：`app/renderer/src/main/src/services/fetch.ts`
- 修改：`app/renderer/src/main/src/utils/notification.tsx`

**接口：**

- `markTokenExpirationSessionRetained(): void`：记录主进程已经明确保留本次社区会话。
- `shouldSuppressTokenExpirationNotification(value: unknown): boolean`：仅对已保留会话中的错误通知与精确原因 `token过期` 返回真值。
- `tokenOverdue(response)`：保留标志为真时记录静默状态；否则执行原有退出逻辑。

**设计内容：**

```typescript
let tokenExpirationSessionRetained = false

export const markTokenExpirationSessionRetained = () => {
  tokenExpirationSessionRetained = true
}

export const shouldSuppressTokenExpirationNotification = (value: unknown) =>
  tokenExpirationSessionRetained && getNotificationMessage(value).includes('token过期')
```

```typescript
export const tokenOverdue = (response?: TokenExpirationResponse) => {
  if (response?.keepLoginOnTokenExpiration) {
    markTokenExpirationSessionRetained()
    return
  }
  if (response?.userInfo) loginOutLocal(response.userInfo)
  yakitNetwork.logoutDynamicControl({ loginOut: false })
  globalUserLogout()
  failed(tOriginal('servicesFetch.loginExpired'))
}
```

- [ ] 编写集成式渲染测试，直接调用现有 `tokenOverdue` 与 `yakitNotify`。
- [ ] 执行新增测试，确认当前空函数无法恢复企业退出，且社区过期错误仍形成通知。
- [ ] 新建模块状态原语，并在通知入口只过滤错误类别。
- [ ] 恢复 `tokenOverdue` 的企业退出逻辑，社区分支只记录本次会话保留状态。
- [ ] 再次执行新增测试，确认社区过期通知静默、普通错误展示、企业退出调用均符合断言。

### 任务三：登录入口与应用生命周期

**文件：**

- 新建：`app/renderer/src/main/src/components/layout/hooks/useLoginPrompt.ts`
- 新建：`app/renderer/src/main/src/components/layout/hooks/__test__/useLoginPrompt.test.tsx`
- 修改：`app/renderer/src/main/src/components/layout/FuncDomain.tsx`

**接口：**

- `useLoginPrompt(isLogin)` 返回 `loginShow`、`openLogin` 与 `closeLogin`。
- `openLogin` 仅在 `isLogin` 为假时开启窗口。
- 钩子监听 `onUIOpSettingMenuSelect`，只处理 `RENYAN_SHELL_EVENTS.openLogin`，卸载时移除监听。

**设计内容：**

```typescript
export const useLoginPrompt = (isLogin: boolean) => {
  const [loginShow, setLoginShow] = useState(false)
  const openLogin = useCallback(() => {
    if (!isLogin) setLoginShow(true)
  }, [isLogin])
  const closeLogin = useCallback(() => setLoginShow(false), [])

  useEffect(() => {
    const handleMenuSelect = (type: string) => {
      if (type === RENYAN_SHELL_EVENTS.openLogin) openLogin()
    }
    emiter.on('onUIOpSettingMenuSelect', handleMenuSelect)
    return () => emiter.off('onUIOpSettingMenuSelect', handleMenuSelect)
  }, [openLogin])

  return { loginShow, openLogin, closeLogin }
}
```

- [ ] 编写钩子测试，使用真实事件总线验证直接入口、菜单事件、已登录门控与状态变化。
- [ ] 执行新增测试，确认目标钩子缺失导致测试失败。
- [ ] 实现钩子，并让 `FuncDomain` 的通知区域、右上角图标和 `Login` 关闭操作使用同一组函数。
- [ ] 再次执行钩子测试与 `LoginRequiredState` 测试，确认发送端与接收端行为均成立。

### 任务四：验证与审查记录

**文件：**

- 修改：`.claude/operations-log.md`
- 修改：`.claude/coding-log.md`
- 修改：`.claude/verification-report.md`

**验证：**

- [ ] 执行三组新增或更新的定向测试。
- [ ] 执行受影响测试选择器与完整渲染端类型检查。
- [ ] 执行目标文件代码规范、格式与差异空白检查。
- [ ] 执行 `codegraph sync .` 与 `codegraph status .`。
- [ ] 对照需求逐项审视证据，记录技术评分、战略评分、综合评分与明确结论。
