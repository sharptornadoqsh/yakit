const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const asn1 = require('asn1js')

if (typeof crypto.getRandomValues !== 'function' && typeof crypto.webcrypto?.getRandomValues === 'function') {
  crypto.getRandomValues = crypto.webcrypto.getRandomValues.bind(crypto.webcrypto)
}
const { sm2 } = require('sm-crypto')

const definitions = [
  { id: 'regular', rpc: 'DownloadMITMCert', stem: 'yak-mitm-ca', name: 'Yakit MITM Root CA' },
  { id: 'gm', rpc: 'DownloadMITMGMCert', stem: 'yak-mitm-gm-ca', name: 'Yakit MITM GM Root CA' },
]
const pending = new Map()
const activeStreams = new Map()
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const raw = (node) => Buffer.from(node.valueBeforeDecodeView)
const encode = (node) => Buffer.from(node.toBER(false))
const bufferSource = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
const oid = (node) => {
  assert.ok(node instanceof asn1.ObjectIdentifier, '证书算法标识无效')
  return node.valueBlock.toString()
}

const decode = (bytes) => {
  const result = asn1.fromBER(bufferSource(bytes))
  assert.ok(result.offset === bytes.length && result.result instanceof asn1.Sequence, '证书 ASN.1 结构无效')
  return result.result
}

const pemBytes = (pem) => {
  const match = Buffer.from(pem).toString('utf8').trim().match(
    /^-----BEGIN ([A-Z ]+)-----\s+([A-Za-z0-9+/=\r\n]+)-----END \1-----$/,
  )
  assert.ok(match, '证书或私钥 PEM 格式无效')
  return Buffer.from(match[2].replace(/\s/g, ''), 'base64')
}

const parseCertificate = (pem) => {
  const root = decode(pemBytes(pem))
  const [tbs, algorithm, signature] = root.valueBlock.value
  assert.ok(
    root.valueBlock.value.length === 3 &&
      tbs instanceof asn1.Sequence &&
      algorithm instanceof asn1.Sequence &&
      signature instanceof asn1.BitString &&
      signature.valueBlock.unusedBits === 0,
    '证书签名结构无效',
  )
  const fields = tbs.valueBlock.value
  const base = fields[0]?.idBlock.tagClass === 3 && fields[0].idBlock.tagNumber === 0 ? 1 : 0
  assert.ok(fields.length >= base + 6, '证书字段不完整')
  assert.ok(raw(fields[base + 1]).equals(raw(algorithm)), '证书签名算法不一致')
  return { root, tbs, fields, algorithm, signature, issuer: base + 2, subject: base + 4, publicKey: base + 5 }
}

const attributes = (name) => name.valueBlock.value.flatMap((rdn) => rdn.valueBlock.value)
const needsBranding = (cert, expectedName) => {
  const names = attributes(cert.fields[cert.subject])
    .filter((attribute) => oid(attribute.valueBlock.value[0]) === '2.5.4.3')
    .map((attribute) => attribute.valueBlock.value[1].valueBlock.value)
  if (names.length !== 1 || ![expectedName, expectedName.replace('Yakit', 'RuiYan')].includes(names[0])) return false
  return [cert.issuer, cert.subject].some((index) => attributes(cert.fields[index]).some((attribute) => {
    const value = attribute.valueBlock.value[1].valueBlock.value
    return typeof value === 'string' && value.includes('Yakit')
  }))
}

const renameName = (name) => {
  for (const rdn of name.valueBlock.value) {
    for (const attribute of rdn.valueBlock.value) {
      const value = attribute.valueBlock.value[1]
      if (typeof value.valueBlock.value === 'string' && value.valueBlock.value.includes('Yakit')) {
        attribute.valueBlock.value[1] = new value.constructor({
          value: value.valueBlock.value.replace(/Yakit/g, 'RuiYan'),
        })
      }
    }
    rdn.valueBlock.value.sort((left, right) => Buffer.compare(encode(left), encode(right)))
  }
}

const createSigner = (cert, privateKeyPem) => {
  const algorithm = oid(cert.algorithm.valueBlock.value[0])
  const spki = cert.fields[cert.publicKey]
  if (algorithm === '1.2.840.113549.1.1.11') {
    const key = crypto.createPrivateKey(privateKeyPem)
    const publicKey = crypto.createPublicKey({ key: raw(spki), type: 'spki', format: 'der' })
    assert.equal(key.asymmetricKeyType, 'rsa', '普通 CA 私钥类型不匹配')
    assert.ok(
      crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(
        publicKey.export({ type: 'spki', format: 'der' }),
      ),
      '普通 CA 公私钥不匹配',
    )
    return {
      sign: (bytes) => crypto.sign('sha256', bytes, key),
      verify: (bytes, signature) => crypto.verify('sha256', bytes, publicKey, signature),
    }
  }
  assert.equal(algorithm, '1.2.156.10197.1.501', '默认 CA 签名算法不受支持，原证书保持不变')
  let keyFields = decode(pemBytes(privateKeyPem)).valueBlock.value
  if (keyFields[1] instanceof asn1.Sequence) {
    assert.ok(keyFields[2] instanceof asn1.OctetString, '国密 PKCS8 私钥结构无效')
    keyFields = decode(Buffer.from(keyFields[2].valueBlock.valueHexView)).valueBlock.value
  }
  assert.ok(keyFields[1] instanceof asn1.OctetString, '国密私钥结构无效')
  const privateKey = Buffer.from(keyFields[1].valueBlock.valueHexView).toString('hex')
  assert.equal(privateKey.length, 64, '国密私钥长度无效')
  const publicKey = Buffer.from(spki.valueBlock.value[1].valueBlock.valueHexView).toString('hex')
  assert.equal(sm2.getPublicKeyFromPrivateKey(privateKey).toLowerCase(), publicKey.toLowerCase(), '国密 CA 公私钥不匹配')
  return {
    sign: (bytes) => Buffer.from(sm2.doSignature(bytes, privateKey, { publicKey, der: true, hash: true }), 'hex'),
    verify: (bytes, signature) =>
      sm2.doVerifySignature(bytes, signature.toString('hex'), publicKey, { der: true, hash: true }),
  }
}

const rebrandCertificate = (pem, readPrivateKey, expectedName) => {
  const original = Buffer.from(pem)
  const cert = parseCertificate(original)
  if (!needsBranding(cert, expectedName)) return original
  assert.ok(raw(cert.fields[cert.issuer]).equals(raw(cert.fields[cert.subject])), '默认 CA 不是自签名证书')
  const preserved = cert.fields.map(raw)
  const signer = createSigner(cert, readPrivateKey())
  assert.ok(signer.verify(raw(cert.tbs), Buffer.from(cert.signature.valueBlock.valueHexView)), '原 CA 签名校验失败')
  renameName(cert.fields[cert.issuer])
  renameName(cert.fields[cert.subject])
  const tbs = encode(cert.tbs)
  const signature = signer.sign(tbs)
  assert.ok(signer.verify(tbs, signature), '新 CA 签名校验失败')
  cert.root.valueBlock.value[2] = new asn1.BitString({ unusedBits: 0, valueHex: bufferSource(signature) })
  const der = encode(cert.root)
  const body = der.toString('base64').match(/.{1,64}/g).join('\n')
  const result = Buffer.from(`-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`)
  const updated = parseCertificate(result)
  assert.equal(updated.fields.length, preserved.length, '重签改变了证书字段数量')
  for (let i = 0; i < preserved.length; i += 1) {
    if (i !== cert.issuer && i !== cert.subject) {
      assert.ok(raw(updated.fields[i]).equals(preserved[i]), '重签改变了名称之外的证书字段')
    }
  }
  assert.ok(raw(updated.algorithm).equals(raw(cert.algorithm)), '重签改变了签名算法')
  assert.ok(signer.verify(raw(updated.tbs), Buffer.from(updated.signature.valueBlock.valueHexView)), '重签后的证书编码校验失败')
  return result
}

const isLocalEngineClient = (client) =>
  /^(?:(?:dns|ipv4|ipv6):\/{0,3})?(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/i.test(
    client?.getChannel?.()?.getTarget?.() || '',
  )

const trackCertificateUse = (stream, client, directory) => {
  if (!isLocalEngineClient(client)) return
  const key = path.resolve(directory)
  const streams = activeStreams.get(key) || new Set()
  streams.add(stream)
  activeStreams.set(key, streams)
  let released = false
  const release = () => {
    if (released) return
    released = true
    streams.delete(stream)
    if (!streams.size && activeStreams.get(key) === streams) activeStreams.delete(key)
  }
  for (const event of ['end', 'error', 'close']) stream.once(event, release)
}

const downloadCertificate = (client, method) => new Promise((resolve, reject) => {
  let call
  let settled = false
  const finish = (error, data) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    if (error) reject(error)
    else resolve(data)
  }
  const timer = setTimeout(() => {
    finish(new Error('读取引擎 CA 超时'))
    call?.cancel?.()
  }, 10000)
  try {
    call = client[method]({}, { deadline: new Date(Date.now() + 10000) }, finish)
  } catch (error) {
    finish(error)
  }
})

const replaceCertificate = (file, bytes, mode) => {
  const temporary = `${file}.ruiyan-${crypto.randomBytes(8).toString('hex')}.tmp`
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600)
    try {
      fs.writeFileSync(fd, bytes)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    // Keep the live path present so the engine never mistakes an update for a missing CA.
    fs.chmodSync(file, mode | 0o200)
    fs.renameSync(temporary, file)
  } finally {
    if (fs.existsSync(file)) fs.chmodSync(file, mode)
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

const loadCertificates = async (client) => {
  const result = {}
  for (const definition of definitions) result[definition.id] = await downloadCertificate(client, definition.rpc)
  return result
}

const prepareLocalCertificates = async ({ client, directory, isBusy }) => {
  const certificates = await loadCertificates(client)
  const selected = definitions.filter((definition) => {
    const pem = Buffer.from(certificates[definition.id].CaCerts)
    // The engine-generated defaults are single PEM certificates, not custom DER files or chains.
    if ((pem.toString('utf8').match(/-----BEGIN CERTIFICATE-----/g) || []).length !== 1) return false
    return needsBranding(parseCertificate(pem), definition.name)
  })
  if (!selected.length) return certificates
  if (isBusy() || activeStreams.get(directory)?.size) {
    throw new Error('当前代理正在使用旧名称 CA，请先停止代理后重新下载证书')
  }
  const updates = selected.map((definition) => {
    const file = path.join(directory, `${definition.stem}.crt`)
    const keyFile = path.join(directory, `${definition.stem}.key`)
    const data = certificates[definition.id]
    const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
    assert.equal(normalize(data.LocalFile), normalize(file), '引擎 CA 路径与当前本地数据目录不一致')
    const stat = fs.lstatSync(file)
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), '默认 CA 路径不是普通文件')
    const original = fs.readFileSync(file)
    assert.ok(original.equals(Buffer.from(data.CaCerts)), '引擎 CA 与磁盘内容不一致，请重试')
    let keyHash
    const updated = rebrandCertificate(original, () => {
      const keyStat = fs.lstatSync(keyFile)
      assert.ok(keyStat.isFile() && !keyStat.isSymbolicLink(), '默认 CA 私钥路径不是普通文件')
      const key = fs.readFileSync(keyFile)
      keyHash = sha256(key)
      return key
    }, definition.name)
    return { definition, file, keyFile, keyHash, original, updated, mode: stat.mode & 0o7777 }
  })
  for (const update of updates) {
    assert.ok(fs.readFileSync(update.file).equals(update.original), 'CA 在更新前发生变化，请重试')
    assert.equal(sha256(fs.readFileSync(update.keyFile)), update.keyHash, 'CA 私钥在更新前发生变化，请重试')
    const backup = `${update.file}.ruiyan-original-${sha256(update.original)}`
    if (fs.existsSync(backup)) {
      const stat = fs.lstatSync(backup)
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), '原 CA 备份不是普通文件')
      assert.ok(fs.readFileSync(backup).equals(update.original), '原 CA 备份不一致')
    } else fs.writeFileSync(backup, update.original, { flag: 'wx', mode: 0o600 })
  }
  try {
    for (const update of updates) replaceCertificate(update.file, update.updated, update.mode)
    const reloaded = await loadCertificates(client)
    for (const update of updates) {
      assert.ok(Buffer.from(reloaded[update.definition.id].CaCerts).equals(update.updated), '引擎尚未重载新 CA')
      assert.ok(fs.readFileSync(update.file).equals(update.updated), 'CA 文件在重载时发生变化')
      assert.equal(sha256(fs.readFileSync(update.keyFile)), update.keyHash, 'CA 私钥发生变化')
    }
    return reloaded
  } catch (error) {
    let recoveryError
    for (const update of [...updates].reverse()) {
      try {
        assert.equal(sha256(fs.readFileSync(update.keyFile)), update.keyHash, 'CA 私钥出现外部改动，已保留原证书备份')
        const current = fs.readFileSync(update.file)
        if (current.equals(update.updated)) replaceCertificate(update.file, update.original, update.mode)
        else assert.ok(current.equals(update.original), 'CA 出现外部改动，已保留备份')
      } catch (failure) {
        recoveryError = recoveryError || failure
      }
    }
    if (!recoveryError) {
      try { await loadCertificates(client) } catch (failure) { recoveryError = failure }
    }
    if (recoveryError) throw new Error(`CA 名称更新失败，原证书备份已保留；恢复待完成：${recoveryError.message}`)
    throw error
  }
}

const prepareMitmCertificates = ({ client, directory, isBusy = () => false }) => {
  if (!isLocalEngineClient(client)) return Promise.resolve(null)
  assert.ok(path.isAbsolute(directory), '本地引擎数据目录须为绝对路径')
  const key = path.resolve(directory)
  if (pending.has(key)) return pending.get(key).then(() => prepareMitmCertificates({ client, directory, isBusy }))
  const task = prepareLocalCertificates({ client, directory: key, isBusy }).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

module.exports = { prepareMitmCertificates, rebrandCertificate, trackCertificateUse }
