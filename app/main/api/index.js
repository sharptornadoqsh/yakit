const { service } = require('../httpServer')
const { ipcMain } = require('electron')
const { assertTrustedAppSender, normalizeRelativeApiPath, normalizeHttpBaseUrl } = require('../security')
const { HttpSetting, USER_INFO } = require('../state')
const { requestPasswordApi } = require('../passwordTransport')

module.exports = (win, getClient) => {
  ipcMain.handle('password-api', async (event, params) => {
    assertTrustedAppSender(event, 'password-api')
    const baseURL = normalizeHttpBaseUrl(HttpSetting.httpBaseURL)
    const session = { isLogin: USER_INFO.isLogin, token: USER_INFO.token, user_id: USER_INFO.user_id }
    const send = (request) => {
      if (
        normalizeHttpBaseUrl(HttpSetting.httpBaseURL) !== baseURL ||
        Object.keys(session).some((field) => USER_INFO[field] !== session[field])
      ) {
        throw new Error('服务地址或登录会话已改变，请重新提交密码')
      }
      const headers = session.isLogin && session.token ? { Authorization: session.token } : undefined
      return service({ ...request, ...(headers ? { headers } : {}) })
    }
    return requestPasswordApi(send, baseURL, normalizeRelativeApiPath(params?.url), params?.data)
  })
  ipcMain.handle('axios-api', async (e, params) => {
    assertTrustedAppSender(e, 'axios-api')

    const safeParams = {
      ...(params || {}),
      url: normalizeRelativeApiPath(params?.url),
    }
    delete safeParams.baseURL
    delete safeParams.proxy
    delete safeParams.httpAgent
    delete safeParams.httpsAgent
    delete safeParams.transport
    delete safeParams.adapter

    return service(safeParams)
  })
}
