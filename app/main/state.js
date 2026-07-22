// user info
const createUserInfo = () => ({
  /** 是否登录 */
  isLogin: false,
  /** 登录平台 */
  platform: null,
  githubName: null,
  githubHeadImg: null,
  wechatName: null,
  wechatHeadImg: null,
  companyName: null,
  companyHeadImg: null,
  qqName: null,
  qqHeadImg: null,
  /** 角色 */
  role: null,
  token: null,
  user_id: 0,
})
const USER_INFO = createUserInfo()
const resetUserInfo = () => Object.assign(USER_INFO, createUserInfo())
const expireUserInfo = () => {
  const expiredUserInfo = { ...USER_INFO, token: null }
  if (!USER_INFO.isLogin || USER_INFO.platform === 'company') resetUserInfo()
  return expiredUserInfo
}
const HttpSetting = {
  httpBaseURL: 'https://www.yaklang.com',
  wsBaseURL: 'wss://www.yaklang.com',
}

/**
 * yak引擎状态和配置参数
 * @property {Boolean} status 引擎是否启动
 * @property {String} defaultYakGRPCAddr 引擎启动地址(本地或者远端)
 * @property {String} password 暂时位置属性
 * @property {String} caPem 远端引擎证书密钥
 */
const GLOBAL_YAK_SETTING = {
  status: false,
  sudo: false,
  defaultYakGRPCAddr: '127.0.0.1:8087',
  password: '',
  caPem: '',
}

module.exports = {
  USER_INFO,
  expireUserInfo,
  resetUserInfo,
  HttpSetting,
  GLOBAL_YAK_SETTING,
}
