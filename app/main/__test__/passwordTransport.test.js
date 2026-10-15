// @vitest-environment node
import Module, { createRequire } from 'module'
import { createServer } from 'http'
import fs from 'fs'
import vm from 'vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { sm2 } = require('sm-crypto')
const { requestPasswordApi } = require('../passwordTransport')
const keyPair = sm2.generateKeyPairHex()
const keyResponse = { code: 200, data: { publicKey: keyPair.publicKey, cipherMode: 'C1C3C2' } }
const baseURL = 'https://enterprise.example.test'
const decrypt = (value) => sm2.doDecrypt(value.slice(2), keyPair.privateKey, 1)

afterEach(() => vi.restoreAllMocks())

const loadWithCrypto = (crypto) => {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(require.resolve('../passwordTransport'), 'utf8'), {
    module,
    require: (name) => {
      if (name === 'crypto') return crypto
      if (name === 'sm-crypto') {
        crypto.getRandomValues(new Uint8Array(32))
        return { sm2 }
      }
      throw new Error(`Unexpected module: ${name}`)
    },
  })
  return module.exports
}

describe('password random source compatibility', () => {
  it('preserves the native function and descriptor without reading webcrypto', () => {
    const native = vi.fn((array) => array)
    const crypto = { getRandomValues: native }
    Object.defineProperty(crypto, 'webcrypto', {
      get: () => {
        throw new Error('Native runtimes must not access the fallback')
      },
    })
    const descriptor = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues')
    expect(loadWithCrypto(crypto).requestPasswordApi).toBeTypeOf('function')
    expect(crypto.getRandomValues).toBe(native)
    expect(Object.getOwnPropertyDescriptor(crypto, 'getRandomValues')).toEqual(descriptor)
    expect(native).toHaveBeenCalledTimes(1)
  })

  it('binds the missing API to webcrypto before loading sm-crypto and remains idempotent', () => {
    const webcrypto = {
      getRandomValues: vi.fn(function (array) {
        expect(this).toBe(webcrypto)
        array.fill(17)
        return array
      }),
    }
    const crypto = { webcrypto }
    expect(loadWithCrypto(crypto).requestPasswordApi).toBeTypeOf('function')
    const installed = crypto.getRandomValues
    const array = new Uint8Array(32)
    expect(installed(array)).toBe(array)
    expect([...array]).toEqual(Array(32).fill(17))
    loadWithCrypto(crypto)
    expect(crypto.getRandomValues).toBe(installed)
    expect(webcrypto.getRandomValues).toHaveBeenCalledTimes(3)
  })

  it.each([{}, { webcrypto: {} }, { webcrypto: { getRandomValues: null } }])(
    'keeps dependency failure visible when no supported random source exists: %j',
    (crypto) => {
      expect(() => loadWithCrypto(crypto)).toThrow(/getRandomValues/)
      expect(crypto.getRandomValues).toBeUndefined()
    },
  )

  it('propagates a random source failure instead of accepting an uninitialized pool', () => {
    const crypto = {
      webcrypto: {
        getRandomValues() {
          throw new Error('Random source failure')
        },
      },
    }
    expect(() => loadWithCrypto(crypto)).toThrow('Random source failure')
  })
})

describe('桌面密码 SM2 提交', () => {
  it('原始 UTF8 密码保留空白与大小写，并使用带 04 前缀的 C1C3C2', async () => {
    const data = { user_name: 'admin', pwd: ' Aa1!原始密码 ' }
    const service = vi
      .fn()
      .mockResolvedValueOnce(keyResponse)
      .mockResolvedValueOnce({ code: 200, data: { token: 't' } })
    await expect(requestPasswordApi(service, baseURL, 'urm/login', data)).resolves.toEqual({
      code: 200,
      data: { token: 't' },
    })
    const request = service.mock.calls[1][0]
    expect(request).toMatchObject({ method: 'post', url: 'urm/login', diyHome: baseURL, maxRedirects: 0 })
    expect(request.data.user_name).toBe('admin')
    expect(request.data.pwd).toMatch(/^04[0-9a-f]+$/)
    expect(request.data.pwd.length).toBe(194 + Buffer.byteLength(data.pwd, 'utf8') * 2)
    expect(decrypt(request.data.pwd)).toBe(data.pwd)
    expect(data.pwd).toBe(' Aa1!原始密码 ')
  })

  it('个人与首次改密加密旧密码、新密码和确认密码', async () => {
    const data = { old_pwd: 'OldPass1!', pwd: 'NewPass2@', confirm_pwd: 'NewPass2@' }
    const service = vi
      .fn()
      .mockResolvedValueOnce(keyResponse)
      .mockResolvedValueOnce({ code: 200, data: { ok: true } })
    await requestPasswordApi(service, baseURL, 'urm/up/userinfo', data)
    const encrypted = service.mock.calls[1][0].data
    for (const field of Object.keys(data)) {
      expect(decrypt(encrypted[field])).toBe(data[field])
      expect(encrypted[field]).not.toBe(data[field])
    }
    expect(encrypted.pwd).not.toBe(encrypted.confirm_pwd)
  })

  it('每次登录重新获取公钥且随机密文不同，不缓存或回落', async () => {
    const service = vi
      .fn()
      .mockImplementation(async (request) => (request.method === 'get' ? keyResponse : { code: 200, data: {} }))
    await requestPasswordApi(service, baseURL, 'urm/login', { pwd: 'SamePass1!' })
    await requestPasswordApi(service, 'https://another.example.test', 'urm/login', { pwd: 'SamePass1!' })
    expect(service.mock.calls.map(([request]) => request.method)).toEqual(['get', 'post', 'get', 'post'])
    expect(service.mock.calls[2][0].diyHome).toBe('https://another.example.test')
    expect(service.mock.calls[3][0].diyHome).toBe('https://another.example.test')
    expect(service.mock.calls[1][0].data.pwd).not.toBe(service.mock.calls[3][0].data.pwd)
  })

  it.each([
    { code: 500, data: keyResponse.data },
    { code: 302, data: keyResponse.data },
    { code: 200, data: { ...keyResponse.data, cipherMode: 'C1C2C3' } },
    { code: 200, data: { ...keyResponse.data, publicKey: '04' + '0'.repeat(128) } },
    { code: 200, data: { ...keyResponse.data, publicKey: '04zz' } },
    { code: 200, data: {} },
  ])('拒绝错误公钥响应且不提交密码：%j', async (response) => {
    const service = vi.fn().mockResolvedValue(response)
    await expect(requestPasswordApi(service, baseURL, 'urm/login', { pwd: 'NoSend1!' })).rejects.toThrow(
      '密码加密公钥无效',
    )
    expect(service).toHaveBeenCalledTimes(1)
  })

  it('公钥请求或加密失败时没有密码请求', async () => {
    const failedService = vi.fn().mockRejectedValue(new Error('公钥请求失败'))
    await expect(requestPasswordApi(failedService, baseURL, 'urm/login', { pwd: 'NoSend1!' })).rejects.toThrow(
      '公钥请求失败',
    )
    expect(failedService).toHaveBeenCalledTimes(1)
    const service = vi.fn().mockResolvedValue(keyResponse)
    vi.spyOn(sm2, 'doEncrypt').mockImplementation(() => {
      throw new Error('加密失败')
    })
    await expect(requestPasswordApi(service, baseURL, 'urm/login', { pwd: 'NoSend1!' })).rejects.toThrow('加密失败')
    expect(service).toHaveBeenCalledTimes(1)
  })

  it.each(['urm', 'https://other.example.test/urm/login', 'toString'])('专用入口拒绝其他路径：%s', async (url) => {
    const service = vi.fn()
    await expect(requestPasswordApi(service, baseURL, url, { pwd: 'NoSend1!' })).rejects.toThrow('密码请求参数无效')
    expect(service).not.toHaveBeenCalled()
  })

  it('缺少改密字段时不发送任何请求', async () => {
    const service = vi.fn()
    await expect(requestPasswordApi(service, baseURL, 'urm/up/userinfo', { pwd: 'NoSend1!' })).rejects.toThrow(
      '密码请求参数无效',
    )
    expect(service).not.toHaveBeenCalled()
  })

  it('真实本地 HTTP 两次请求固定同一服务地址且线上请求体只有密文', async () => {
    const received = []
    const server = createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      received.push({ url: request.url, body: Buffer.concat(chunks).toString('utf8') })
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(request.url === '/api/urm/sm2-public-key' ? keyResponse.data : { ok: true }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = `http://127.0.0.1:${server.address().port}`
      let activeBaseURL = address
      const axios = require('axios')
      const service = async ({ diyHome, ...params }) => {
        const result = await axios({ ...params, baseURL: `${diyHome || activeBaseURL}/api/`, proxy: false })
        activeBaseURL = 'http://127.0.0.1:1'
        return { code: result.status, data: result.data }
      }
      await requestPasswordApi(service, activeBaseURL, 'urm/login', { user_name: 'admin', pwd: 'Online1!原文' })
      expect(received.map((request) => request.url)).toEqual(['/api/urm/sm2-public-key', '/api/urm/login'])
      expect(received[1].body).not.toContain('Online1!原文')
      expect(decrypt(JSON.parse(received[1].body).pwd)).toBe('Online1!原文')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('真实 IPC 注册固定公钥和提交地址且不改变普通网络桥', async () => {
    const handlers = new Map()
    const state = {
      HttpSetting: { httpBaseURL: baseURL },
      USER_INFO: { isLogin: true, token: 'session-a', user_id: 1 },
    }
    const assertTrustedAppSender = vi.fn()
    const service = vi.fn().mockImplementation(async (request) => {
      if (request.method === 'get') {
        return keyResponse
      }
      return { code: 200, data: { ok: true } }
    })
    const modulePath = require.resolve('../api/index')
    const originalLoad = Module._load
    Module._load = function (id, parent, isMain) {
      if (parent?.filename === modulePath) {
        if (id === 'electron') return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
        if (id === '../httpServer') return { service }
        if (id === '../state') return state
        if (id === '../security')
          return {
            assertTrustedAppSender,
            normalizeRelativeApiPath: (value) => value,
            normalizeHttpBaseUrl: (value) => value,
          }
      }
      return originalLoad.call(this, id, parent, isMain)
    }
    delete require.cache[modulePath]
    try {
      require(modulePath)()
      const event = { sender: 'fixture' }
      await handlers.get('password-api')(event, {
        url: 'urm/login',
        data: { pwd: 'Input1!' },
        diyHome: 'https://injected.example.test',
      })
      expect(assertTrustedAppSender).toHaveBeenCalledWith(event, 'password-api')
      expect(service.mock.calls.map(([request]) => request.diyHome)).toEqual([baseURL, baseURL])
      expect(service.mock.calls.map(([request]) => request.headers.Authorization)).toEqual(['session-a', 'session-a'])
      expect(decrypt(service.mock.calls[1][0].data.pwd)).toBe('Input1!')
      service.mockClear()
      await handlers.get('axios-api')(event, { url: 'urm/up/userinfo', method: 'post', data: { head_img: 'avatar' } })
      expect(service).toHaveBeenCalledWith({ url: 'urm/up/userinfo', method: 'post', data: { head_img: 'avatar' } })
      assertTrustedAppSender.mockImplementation(() => {
        throw new Error('来源无效')
      })
      await expect(
        handlers.get('password-api')(event, { url: 'urm/login', data: { pwd: 'NoSend1!' } }),
      ).rejects.toThrow('来源无效')
      expect(service).toHaveBeenCalledTimes(1)
    } finally {
      Module._load = originalLoad
      delete require.cache[modulePath]
    }
  })

  it.each(['host', 'isLogin', 'token', 'user_id'])('公钥等待期间 %s 改变时拒绝旧表单且不提交密码', async (field) => {
    const handlers = new Map()
    const state = {
      HttpSetting: { httpBaseURL: baseURL },
      USER_INFO: { isLogin: true, token: 'session-a', user_id: 1 },
    }
    let releaseKey
    const service = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseKey = resolve
        }),
    )
    const modulePath = require.resolve('../api/index')
    const originalLoad = Module._load
    Module._load = function (id, parent, isMain) {
      if (parent?.filename === modulePath) {
        if (id === 'electron') return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
        if (id === '../httpServer') return { service }
        if (id === '../state') return state
        if (id === '../security')
          return {
            assertTrustedAppSender: vi.fn(),
            normalizeRelativeApiPath: (value) => value,
            normalizeHttpBaseUrl: (value) => value,
          }
      }
      return originalLoad.call(this, id, parent, isMain)
    }
    delete require.cache[modulePath]
    try {
      require(modulePath)()
      const pending = handlers.get('password-api')(
        {},
        {
          url: 'urm/up/userinfo',
          data: { old_pwd: 'OldPass1!', pwd: 'NewPass2@', confirm_pwd: 'NewPass2@' },
        },
      )
      expect(service).toHaveBeenCalledTimes(1)
      if (field === 'host') state.HttpSetting.httpBaseURL = 'https://changed.example.test'
      else state.USER_INFO[field] = { isLogin: false, token: 'session-b', user_id: 2 }[field]
      releaseKey(keyResponse)
      await expect(pending).rejects.toThrow('服务地址或登录会话已改变，请重新提交密码')
      expect(service).toHaveBeenCalledTimes(1)
      expect(service.mock.calls[0][0]).toMatchObject({ method: 'get', headers: { Authorization: 'session-a' } })
    } finally {
      Module._load = originalLoad
      delete require.cache[modulePath]
    }
  })
})
