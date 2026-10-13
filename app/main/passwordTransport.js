const { sm2 } = require('sm-crypto')

const passwordFields = {
  'urm/login': ['pwd'],
  'urm/up/userinfo': ['old_pwd', 'pwd', 'confirm_pwd'],
}

const requestPasswordApi = async (service, baseURL, url, data) => {
  const fields = Object.prototype.hasOwnProperty.call(passwordFields, url) ? passwordFields[url] : null
  if (!fields || !data || fields.some((field) => typeof data[field] !== 'string')) {
    throw new Error('密码请求参数无效')
  }

  const response = await service({
    method: 'get',
    url: 'urm/sm2-public-key',
    diyHome: baseURL,
    maxRedirects: 0,
  })
  const { publicKey, cipherMode } = response?.data || {}
  if (
    !(response?.code >= 200 && response?.code < 300) ||
    cipherMode !== 'C1C3C2' ||
    typeof publicKey !== 'string' ||
    !/^04[0-9a-f]{128}$/i.test(publicKey) ||
    !sm2.verifyPublicKey(publicKey)
  ) {
    throw new Error('密码加密公钥无效')
  }

  const encrypted = { ...data }
  for (const field of fields) {
    encrypted[field] = `04${sm2.doEncrypt(data[field], publicKey, 1)}`
  }
  return service({
    method: 'post',
    url,
    data: encrypted,
    diyHome: baseURL,
    maxRedirects: 0,
  })
}

module.exports = { requestPasswordApi }
