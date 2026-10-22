// @vitest-environment node

import fs from 'fs'
import path from 'path'
import os from 'os'
import vm from 'vm'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { createRequire } from 'module'
import * as asn1 from 'asn1js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareMitmCertificates, rebrandCertificate, trackCertificateUse } from '../mitmCertificateBranding'

const nativeRequire = createRequire(import.meta.url)
const { sm2 } = nativeRequire('sm-crypto')
const directories = []
const encode = (node) => Buffer.from(node.toBER(false))
const source = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const parse = (bytes) => asn1.fromBER(source(bytes)).result
const raw = (node) => Buffer.from(node.valueBeforeDecodeView)
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const pem = (label, bytes) => Buffer.from(
  `-----BEGIN ${label}-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`,
)
const der = (bytes) => Buffer.from(Buffer.from(bytes).toString().replace(/-----[^\r\n]+-----|\s/g, ''), 'base64')
const sequence = (value) => new asn1.Sequence({ value })
const objectId = (value) => new asn1.ObjectIdentifier({ value })
const octets = (bytes) => new asn1.OctetString({ valueHex: source(bytes) })
const bits = (bytes) => new asn1.BitString({ valueHex: source(bytes), unusedBits: 0 })
const tagged = (tagNumber, value) => new asn1.Constructed({ idBlock: { tagClass: 3, tagNumber }, value })
const dn = (name, organization) => sequence([
  new asn1.Set({ value: [sequence([objectId('2.5.4.6'), new asn1.PrintableString({ value: 'CN' })])] }),
  new asn1.Set({ value: [sequence([objectId('2.5.4.10'), new asn1.PrintableString({ value: organization })])] }),
  new asn1.Set({ value: [sequence([objectId('2.5.4.3'), new asn1.Utf8String({ value: name })])] }),
])

const rsaKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const gmKeys = sm2.generateKeyPairHex()
const makeCertificate = (kind = 'regular', { name, organization = 'Yakit Team', pkcs8 = true } = {}) => {
  name = name || (kind === 'gm' ? 'Yakit MITM GM Root CA' : 'Yakit MITM Root CA')
  const algorithm = () => sequence([
    objectId(kind === 'gm' ? '1.2.156.10197.1.501' : '1.2.840.113549.1.1.11'),
    ...(kind === 'gm' ? [] : [new asn1.Null()]),
  ])
  let privateKey
  let publicKey
  let sign
  let verify
  if (kind === 'gm') {
    publicKey = sequence([
      sequence([objectId('1.2.840.10045.2.1'), objectId('1.2.156.10197.1.301')]),
      bits(Buffer.from(gmKeys.publicKey, 'hex')),
    ])
    const ecKey = sequence([
      new asn1.Integer({ value: 1 }), octets(Buffer.from(gmKeys.privateKey, 'hex')),
      tagged(0, [objectId('1.2.156.10197.1.301')]), tagged(1, [bits(Buffer.from(gmKeys.publicKey, 'hex'))]),
    ])
    privateKey = pkcs8
      ? pem('PRIVATE KEY', encode(sequence([
        new asn1.Integer({ value: 0 }), publicKey.valueBlock.value[0], octets(encode(ecKey)),
      ])))
      : pem('EC PRIVATE KEY', encode(ecKey))
    sign = (bytes) => Buffer.from(sm2.doSignature(bytes, gmKeys.privateKey, { der: true, hash: true }), 'hex')
    verify = (bytes, signature) =>
      sm2.doVerifySignature(bytes, signature.toString('hex'), gmKeys.publicKey, { der: true, hash: true })
  } else {
    publicKey = parse(rsaKeys.publicKey.export({ type: 'spki', format: 'der' }))
    privateKey = Buffer.from(rsaKeys.privateKey.export({ type: 'pkcs1', format: 'pem' }))
    sign = (bytes) => crypto.sign('sha256', bytes, rsaKeys.privateKey)
    verify = (bytes, signature) => crypto.verify('sha256', bytes, rsaKeys.publicKey, signature)
  }
  const tbs = sequence([
    tagged(0, [new asn1.Integer({ value: 2 })]),
    new asn1.Integer({ value: 234567 }),
    algorithm(),
    dn(name, organization),
    sequence([
      new asn1.UTCTime({ valueDate: new Date('2020-01-01T00:00:00Z') }),
      new asn1.GeneralizedTime({ valueDate: new Date('2125-09-26T00:00:00Z') }),
    ]),
    dn(name, organization),
    publicKey,
    tagged(3, [sequence([
      sequence([
        objectId('2.5.29.19'), new asn1.Boolean({ value: true }),
        octets(encode(sequence([new asn1.Boolean({ value: true })]))),
      ]),
      sequence([objectId('2.5.29.14'), octets(encode(octets(Buffer.alloc(20, 7))))]),
      sequence([objectId('1.3.6.1.4.1.55555.1'), octets(Buffer.from('unchanged-extension'))]),
    ])]),
  ])
  return {
    certificate: pem('CERTIFICATE', encode(sequence([tbs, algorithm(), bits(sign(encode(tbs)))]))),
    privateKey,
    verify,
  }
}

const fields = (certificate) => parse(der(certificate)).valueBlock.value[0].valueBlock.value
const expectedName = (kind) => kind === 'gm' ? 'Yakit MITM GM Root CA' : 'Yakit MITM Root CA'

describe('MITM CA name-only re-signing', () => {
  it.each([['regular', true], ['gm', true], ['gm', false]])('preserves other fields and the key: %s/%s', (kind, pkcs8) => {
    const original = makeCertificate(kind, { pkcs8 })
    const key = Buffer.from(original.privateKey)
    const result = rebrandCertificate(original.certificate, () => original.privateKey, expectedName(kind))
    const before = fields(original.certificate)
    const after = fields(result)
    expect(result.equals(original.certificate)).toBe(false)
    expect(original.privateKey.equals(key)).toBe(true)
    expect(after).toHaveLength(before.length)
    before.forEach((field, index) => {
      if (index !== 3 && index !== 5) expect(raw(after[index]).equals(raw(field))).toBe(true)
    })
    for (const index of [3, 5]) {
      const values = after[index].valueBlock.value.map(
        (rdn) => rdn.valueBlock.value[0].valueBlock.value[1].valueBlock.value,
      )
      expect(values).toEqual(['CN', 'RuiYan Team', expectedName(kind).replace('Yakit', 'RuiYan')])
    }
    const [tbs, algorithm, signature] = parse(der(result)).valueBlock.value
    expect(raw(algorithm).equals(raw(parse(der(original.certificate)).valueBlock.value[1]))).toBe(true)
    expect(original.verify(raw(tbs), Buffer.from(signature.valueBlock.valueHexView))).toBe(true)
    if (kind === 'regular') expect(new crypto.X509Certificate(result).verify(rsaKeys.publicKey)).toBe(true)
    const readKey = vi.fn(() => { throw new Error('already branded') })
    expect(rebrandCertificate(result, readKey, expectedName(kind)).equals(result)).toBe(true)
    expect(readKey).not.toHaveBeenCalled()
  })

  it.each(['regular', 'gm'])('keeps custom CA bytes unchanged: %s', (kind) => {
    const original = makeCertificate(kind, { name: 'Custom CA' })
    const readKey = vi.fn(() => { throw new Error('custom key') })
    expect(rebrandCertificate(original.certificate, readKey, expectedName(kind))).toEqual(original.certificate)
    expect(readKey).not.toHaveBeenCalled()
  })

  it('rejects a modified signature and a mismatching key before returning a new certificate', () => {
    const original = makeCertificate()
    const damaged = der(original.certificate)
    damaged[damaged.length - 1] ^= 1
    expect(() => rebrandCertificate(
      pem('CERTIFICATE', damaged), () => original.privateKey, expectedName('regular'),
    )).toThrow('原 CA 签名')
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(() => rebrandCertificate(
      original.certificate, () => other.privateKey.export({ type: 'pkcs1', format: 'pem' }), expectedName('regular'),
    )).toThrow('公私钥不匹配')
    expect(() => rebrandCertificate(
      'not a certificate', () => original.privateKey, expectedName('regular'),
    )).toThrow('PEM')
  })

  it('rejects a mismatching SM2 key and a damaged SM2 signature', () => {
    const original = makeCertificate('gm')
    const wrongKey = pem('EC PRIVATE KEY', encode(sequence([
      new asn1.Integer({ value: 1 }), octets(Buffer.alloc(32, 1)),
    ])))
    expect(() => rebrandCertificate(original.certificate, () => wrongKey, expectedName('gm'))).toThrow('公私钥不匹配')
    const damaged = der(original.certificate)
    damaged[damaged.length - 1] ^= 1
    expect(() => rebrandCertificate(
      pem('CERTIFICATE', damaged), () => original.privateKey, expectedName('gm'),
    )).toThrow('原 CA 签名')
  })
})

const createDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-ca-'))
  directories.push(directory)
  return directory
}

const createStore = () => {
  const directory = createDirectory()
  const originals = {}
  for (const kind of ['regular', 'gm']) {
    const fixture = makeCertificate(kind)
    const stem = kind === 'gm' ? 'yak-mitm-gm-ca' : 'yak-mitm-ca'
    const file = path.join(directory, `${stem}.crt`)
    const keyFile = path.join(directory, `${stem}.key`)
    fs.writeFileSync(file, fixture.certificate, { mode: 0o444 })
    fs.writeFileSync(keyFile, fixture.privateKey, { mode: 0o444 })
    originals[kind] = { ...fixture, file, keyFile }
  }
  let calls = 0
  let fault
  const client = { getChannel: () => ({ getTarget: () => '127.0.0.1:9012' }) }
  for (const [method, kind] of [['DownloadMITMCert', 'regular'], ['DownloadMITMGMCert', 'gm']]) {
    client[method] = vi.fn((request, options, callback) => {
      calls += 1
      const data = { CaCerts: fs.readFileSync(originals[kind].file), LocalFile: originals[kind].file }
      if (calls === 3 && fault === 'reload') callback(new Error('fixture reload failure'))
      else if (calls === 3 && fault === 'stale') callback(null, { ...data, CaCerts: originals[kind].certificate })
      else callback(null, data)
      return { cancel: vi.fn() }
    })
  }
  return { directory, originals, client, fault: (value) => { fault = value } }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  const temporary = fs.realpathSync(os.tmpdir())
  for (const directory of directories.splice(0)) {
    const resolved = fs.realpathSync(directory)
    if (!resolved.startsWith(`${temporary}${path.sep}`) || !path.basename(resolved).startsWith('ruiyan-ca-')) {
      throw new Error('Unexpected certificate test directory')
    }
    for (const name of fs.readdirSync(resolved)) fs.chmodSync(path.join(resolved, name), 0o600)
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})

describe('MITM CA deployment and engine reload', () => {
  it('updates both read-only certificates, preserves keys, and is idempotent', async () => {
    const store = createStore()
    const modes = Object.values(store.originals).map((item) => fs.statSync(item.file).mode)
    const options = { client: store.client, directory: store.directory }
    const [first, second] = await Promise.all([prepareMitmCertificates(options), prepareMitmCertificates(options)])
    for (const [index, kind] of ['regular', 'gm'].entries()) {
      const item = store.originals[kind]
      expect(first[kind].CaCerts).toEqual(fs.readFileSync(item.file))
      expect(second[kind].CaCerts).toEqual(first[kind].CaCerts)
      expect(sha256(fs.readFileSync(item.keyFile))).toBe(sha256(item.privateKey))
      expect(fs.statSync(item.file).mode).toBe(modes[index])
      const backup = `${item.file}.ruiyan-original-${sha256(item.certificate)}`
      expect(fs.readFileSync(backup)).toEqual(item.certificate)
    }
    const again = await prepareMitmCertificates({ ...options, isBusy: () => true })
    expect(again).toEqual(second)
  })

  it.each(['write', 'reload', 'stale'])('restores original certificates on failure: %s', async (failure) => {
    const store = createStore()
    if (failure === 'write') {
      const rename = fs.renameSync.bind(fs)
      let failed = false
      vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (!failed && to === store.originals.gm.file) {
          failed = true
          throw new Error('fixture write failure')
        }
        return rename(from, to)
      })
    } else store.fault(failure)
    await expect(prepareMitmCertificates({ client: store.client, directory: store.directory })).rejects.toThrow()
    for (const item of Object.values(store.originals)) {
      expect(fs.readFileSync(item.file)).toEqual(item.certificate)
      expect(sha256(fs.readFileSync(item.keyFile))).toBe(sha256(item.privateKey))
    }
    store.fault(undefined)
    const result = await prepareMitmCertificates({ client: store.client, directory: store.directory })
    expect(result.regular.CaCerts.equals(store.originals.regular.certificate)).toBe(false)
  })

  it('finishes a previously interrupted pair without re-signing the completed CA', async () => {
    const store = createStore()
    const item = store.originals.regular
    const completed = rebrandCertificate(item.certificate, () => item.privateKey, expectedName('regular'))
    fs.chmodSync(item.file, 0o600)
    fs.writeFileSync(item.file, completed)
    const result = await prepareMitmCertificates({ client: store.client, directory: store.directory })
    expect(result.regular.CaCerts).toEqual(completed)
    expect(result.gm.CaCerts.equals(store.originals.gm.certificate)).toBe(false)
  })

  it('preserves an externally changed key and reports incomplete recovery', async () => {
    const store = createStore()
    const reply = store.client.DownloadMITMCert.getMockImplementation()
    let calls = 0
    const external = Buffer.from('externally replaced key')
    store.client.DownloadMITMCert.mockImplementation((...args) => {
      calls += 1
      if (calls === 2) {
        fs.chmodSync(store.originals.regular.keyFile, 0o600)
        fs.writeFileSync(store.originals.regular.keyFile, external)
      }
      return reply(...args)
    })
    await expect(prepareMitmCertificates({
      client: store.client, directory: store.directory,
    })).rejects.toThrow('恢复待完成')
    expect(sha256(fs.readFileSync(store.originals.regular.keyFile))).toBe(sha256(external))
    expect(calls).toBe(2)
  })

  it('leaves active old CAs and remote engines unchanged', async () => {
    const store = createStore()
    await expect(prepareMitmCertificates({
      client: store.client, directory: store.directory, isBusy: () => true,
    })).rejects.toThrow('请先停止代理')
    expect(fs.readFileSync(store.originals.regular.file)).toEqual(store.originals.regular.certificate)
    const remote = { ...store.client, getChannel: () => ({ getTarget: () => '192.0.2.1:9012' }) }
    store.client.DownloadMITMCert.mockClear()
    expect(await prepareMitmCertificates({ client: remote, directory: store.directory })).toBeNull()
    expect(store.client.DownloadMITMCert).not.toHaveBeenCalled()
  })

  it('rejects an unexpected engine path before replacing files', async () => {
    const store = createStore()
    store.client.DownloadMITMCert.mockImplementation((request, options, callback) => callback(null, {
      CaCerts: store.originals.regular.certificate, LocalFile: path.join(store.directory, 'unexpected.crt'),
    }))
    await expect(prepareMitmCertificates({ client: store.client, directory: store.directory })).rejects.toThrow('路径')
    expect(fs.readFileSync(store.originals.regular.file)).toEqual(store.originals.regular.certificate)
  })

  it('keeps shared CA usage active until the current stream ends', async () => {
    const store = createStore()
    const options = { client: store.client, directory: store.directory }
    const first = new EventEmitter()
    const second = new EventEmitter()
    trackCertificateUse(first, store.client, store.directory)
    await expect(prepareMitmCertificates(options)).rejects.toThrow('请先停止代理')
    first.emit('end')
    trackCertificateUse(second, store.client, store.directory)
    first.emit('close')
    await expect(prepareMitmCertificates(options)).rejects.toThrow('请先停止代理')
    second.emit('end')
    expect((await prepareMitmCertificates(options)).regular.CaCerts).not.toEqual(store.originals.regular.certificate)
  })

  it.each(['custom', 'chain', 'der'])('preserves custom formats without reading private keys: %s', async (format) => {
    const store = createStore()
    const originals = {}
    for (const [kind, item] of Object.entries(store.originals)) {
      let bytes = makeCertificate(kind, { name: 'Custom CA' }).certificate
      if (format === 'chain') bytes = Buffer.concat([item.certificate, bytes])
      if (format === 'der') bytes = der(bytes)
      fs.chmodSync(item.file, 0o600)
      fs.writeFileSync(item.file, bytes)
      fs.chmodSync(item.keyFile, 0o600)
      fs.unlinkSync(item.keyFile)
      originals[kind] = bytes
    }
    const result = await prepareMitmCertificates({ client: store.client, directory: store.directory })
    expect(result.regular.CaCerts).toEqual(originals.regular)
    expect(result.gm.CaCerts).toEqual(originals.gm)
  })

  it('bounds a stalled engine request and cancels only that request', async () => {
    const store = createStore()
    vi.useFakeTimers()
    const cancel = vi.fn()
    store.client.DownloadMITMCert.mockImplementation(() => ({ cancel }))
    const failure = prepareMitmCertificates({ client: store.client, directory: store.directory })
      .catch((error) => error)
    await vi.advanceTimersByTimeAsync(10001)
    expect((await failure).message).toContain('超时')
    expect(cancel).toHaveBeenCalledOnce()
  })
})

const createHandlers = (prepare, version = 'mitm') => {
  const handlers = new Map()
  const stream = Object.assign(new EventEmitter(), { write: vi.fn(() => true), cancel: vi.fn() })
  const track = vi.fn()
  const client = {
    MITM: vi.fn(() => stream),
    MITMV2: vi.fn(() => stream),
    DownloadMITMCert: vi.fn((params, callback) => callback(null, { CaCerts: 'remote' })),
  }
  const handlerPath = path.resolve(`app/main/handlers/${version}.js`)
  const handlerRequire = createRequire(handlerPath)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(handlerPath, 'utf8'), {
    module,
    Buffer,
    setTimeout,
    require: (name) => {
      if (name === 'electron') return { ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }
      if (name === '../filePath') return { getYakitHome: () => os.tmpdir() }
      if (name === '../logFile') return { engineLogOutputFile: vi.fn(), getFormattedDateTime: () => 'fixture' }
      if (name === '../mitmCertificateBranding') return { prepareMitmCertificates: prepare, trackCertificateUse: track }
      return handlerRequire(name)
    },
  })
  module.exports({ webContents: { send: vi.fn() } }, () => client)
  return { handlers, client, stream, track }
}

describe('MITM CA IPC integration', () => {
  const parameters = { host: '127.0.0.1', port: 8083, extra: {} }

  it('prepares CAs before one shared start and uses branded download responses', async () => {
    let finish
    const prepare = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    const harness = createHandlers(prepare)
    const start = harness.handlers.get('mitm-start-call')
    const first = start(null, parameters)
    const second = start(null, { ...parameters, port: 8084 })
    expect(harness.client.MITM).not.toHaveBeenCalled()
    finish({ regular: { CaCerts: 'RuiYan' }, gm: { CaCerts: 'RuiYan-GM' } })
    await Promise.all([first, second])
    expect(harness.client.MITM).toHaveBeenCalledOnce()
    expect(harness.track).toHaveBeenCalledOnce()
    expect(harness.stream.write.mock.calls[0][0].port).toBe(8083)
    prepare.mockResolvedValue({ regular: { CaCerts: 'RuiYan' }, gm: { CaCerts: 'RuiYan-GM' } })
    expect(await harness.handlers.get('DownloadMITMCert')(null, {})).toEqual({ CaCerts: 'RuiYan' })
    expect(await harness.handlers.get('DownloadMITMGMCert')(null, {})).toEqual({ CaCerts: 'RuiYan-GM' })
    expect(prepare.mock.calls[prepare.mock.calls.length - 1][0].isBusy()).toBe(true)
  })

  it.each(['mitm', 'mitmV2'])('does not start %s after cancellation during CA preparation', async (version) => {
    let finish
    const harness = createHandlers(() => new Promise((resolve) => { finish = resolve }), version)
    const params = version === 'mitm' ? parameters : { Host: '127.0.0.1', Port: 8083, extra: {} }
    const pending = harness.handlers.get(`${version}-start-call`)(null, params)
    harness.handlers.get(`${version}-stop-call`)()
    finish(null)
    await pending
    expect(harness.client.MITM).not.toHaveBeenCalled()
    expect(harness.client.MITMV2).not.toHaveBeenCalled()
  })

  it('prepares and tracks certificates before a MITMV2 stream starts', async () => {
    vi.useFakeTimers()
    const prepare = vi.fn().mockResolvedValue({ regular: {}, gm: {} })
    const harness = createHandlers(prepare, 'mitmV2')
    await harness.handlers.get('mitmV2-start-call')(null, { Host: '127.0.0.1', Port: 8083, extra: {} })
    expect(prepare).toHaveBeenCalledOnce()
    expect(harness.client.MITMV2).toHaveBeenCalledOnce()
    expect(harness.track).toHaveBeenCalledOnce()
    expect(harness.stream.write.mock.calls[0][0].Port).toBe(8083)
    await vi.advanceTimersByTimeAsync(20)
  })

  it('keeps the remote download path and does not start after preparation failure', async () => {
    const prepare = vi.fn().mockResolvedValue(null)
    const harness = createHandlers(prepare)
    expect(await harness.handlers.get('DownloadMITMCert')(null, {})).toEqual({ CaCerts: 'remote' })
    prepare.mockRejectedValue(new Error('fixture CA failure'))
    await expect(harness.handlers.get('mitm-start-call')(null, parameters)).rejects.toThrow('fixture CA failure')
    expect(harness.client.MITM).not.toHaveBeenCalled()
  })
})
