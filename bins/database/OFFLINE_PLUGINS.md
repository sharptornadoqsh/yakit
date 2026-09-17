# 官方公开插件快照

本目录的 `official-plugins.zip` 是标准插件导入包，不是用户数据库。资源来自官方公开接口
`https://www.yaklang.com/api/plugins/download`，请求只选择 `official=true`、`is_private=false`，
不使用用户登录令牌。作者、源码、参数、风险说明及分类信息保留在条目中。

当前快照数量、类型分布、采集时间和 SHA-256 以 `official-plugins.json` 为准。
正常构建直接携带仓库中的固定快照；首次离线连接本地引擎时导入缺失插件并建立专项分类，
已有同名插件保持原样。完成标记存入当前引擎配置数据库，后续重启不会反复覆盖用户修改或删除。
远程引擎不会被自动导入。

## 更新快照

更新资源时，先从官方接口取得全部公开官方数据页，核对总数和来源，然后在仓库根执行：

```text
node packageScript/script/prepare-offline-plugins.js bins/database <page-1.json> <page-2.json> ...
```

生成器会拒绝私有、非官方、重复名称、缺正文和不完整分页数据。
更新后运行离线初始化、打包校验与真实引擎回归，再一并提交 ZIP 和 JSON。

离线安装应选择包含引擎的安装包。插件内容和本地执行不依赖首次联网下载；
调用 AI、DNSLog 或其他外部服务的插件仍需要配置对应服务，插件自带的该类依赖不会被伪装成本地能力。
