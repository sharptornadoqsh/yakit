import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  atomicInstallEngine,
  calculateFileSha256,
  downloadAndVerifyArtifact,
  extractArchiveEntry,
  extractAndVerifyEngineArchive,
  getCompatibilityEntry,
  recoverInterruptedEngineInstall,
  selectBundledEngineArchivePath,
  verifyFileSha256,
  isWindowsLegacy,
} from '../engineLifecycle'
import { deployWindowsLegacyBundle } from '../windowsLegacyEngine'

describe('Windows legacy 完整集合部署', () => {
  let root
  let archivePath
  let directory
  let artifact
  const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-legacy-bundle-'))
    directory = path.join(root, 'yak-engine')
    fs.mkdirSync(directory)
    archivePath = path.join(root, 'bundle.zip')
    const names = ['yak.exe', 'ucrtbase.dll', ...Array.from({ length: 41 }, (_, index) => `api-ms-win-fixture-${index}.dll`)]
    artifact = { files: names.map((name) => ({ name, sha256: hash(`new-${name}`) })), replaceEngineSha256: [hash('known-old')] }
    const zip = new AdmZip()
    for (const name of names) {
      zip.addFile(`bins/${name === 'yak.exe' ? 'yak_windows_amd64.exe' : name}`, Buffer.from(`new-${name}`))
    }
    zip.writeZip(archivePath)
    artifact.archiveSha256 = hash(fs.readFileSync(archivePath))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const deploy = (extra = {}) => deployWindowsLegacyBundle({ archivePath, artifact, directory, ...extra })

  it('首次安装完整集合，重复启动不再写入', async () => {
    expect(await deploy()).toMatchObject({ changed: true, engineReplaced: true })
    for (const file of artifact.files) {
      expect(hash(fs.readFileSync(path.join(directory, file.name)))).toBe(file.sha256)
    }
    expect(await deploy()).toEqual({ changed: false, engineReplaced: false })
    fs.unlinkSync(path.join(directory, 'ucrtbase.dll'))
    expect(await deploy()).toMatchObject({ changed: true, engineReplaced: false })
  })

  it.each(['known-old', 'user-selected'])('已有引擎 %s 不跳过运行库部署', async (existing) => {
    fs.writeFileSync(path.join(directory, 'yak.exe'), existing)
    fs.writeFileSync(path.join(directory, 'business.db'), 'keep')
    await deploy()
    expect(fs.readFileSync(path.join(directory, 'yak.exe'), 'utf8')).toBe(
      existing === 'known-old' ? 'new-yak.exe' : existing,
    )
    expect(fs.readFileSync(path.join(directory, 'ucrtbase.dll'), 'utf8')).toBe('new-ucrtbase.dll')
    expect(fs.readFileSync(path.join(directory, 'business.db'), 'utf8')).toBe('keep')
  })

  it.each(['file', 'hash', 'archive', 'entry'])('集合错误 %s 在替换前终止', async (fault) => {
    fs.writeFileSync(path.join(directory, 'yak.exe'), 'known-old')
    if (fault === 'file') artifact.files.pop()
    if (fault === 'hash') artifact.files[1].sha256 = '0'.repeat(64)
    if (fault === 'archive') artifact.archiveSha256 = '0'.repeat(64)
    if (fault === 'entry') {
      const zip = new AdmZip(archivePath)
      zip.deleteFile('bins/ucrtbase.dll')
      zip.writeZip(archivePath)
      artifact.archiveSha256 = hash(fs.readFileSync(archivePath))
    }
    await expect(deploy()).rejects.toThrow()
    expect(fs.readFileSync(path.join(directory, 'yak.exe'), 'utf8')).toBe('known-old')
    expect(fs.existsSync(path.join(directory, 'ucrtbase.dll'))).toBe(false)
  })

  it('替换中断后恢复整套旧文件，再次部署成功', async () => {
    fs.writeFileSync(path.join(directory, 'yak.exe'), 'known-old')
    fs.writeFileSync(path.join(directory, 'ucrtbase.dll'), 'old-ucrt')
    const rename = fs.renameSync.bind(fs)
    let failed = false
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (!failed && String(from).endsWith('ucrtbase.dll') && String(from).includes('.legacy-stage-')) {
        failed = true
        throw new Error('模拟写入中断')
      }
      return rename(from, to)
    })
    await expect(deploy()).rejects.toThrow('模拟写入中断')
    expect(fs.readFileSync(path.join(directory, 'yak.exe'), 'utf8')).toBe('known-old')
    expect(fs.readFileSync(path.join(directory, 'ucrtbase.dll'), 'utf8')).toBe('old-ucrt')
    expect(await deploy()).toMatchObject({ changed: true })
  })

  it('重启后恢复遗留事务，不依赖上一次进程内状态', async () => {
    const stage = '.legacy-stage-fixture'
    fs.mkdirSync(path.join(directory, stage))
    fs.writeFileSync(path.join(directory, stage, 'yak.exe.previous'), 'user-selected')
    fs.writeFileSync(path.join(directory, 'yak.exe'), 'partial-new')
    fs.writeFileSync(path.join(directory, '.legacy-install.json'), JSON.stringify({
      stage,
      files: [{ name: 'yak.exe', existed: true }, { name: 'ucrtbase.dll', existed: false }],
    }))
    await deploy()
    expect(fs.readFileSync(path.join(directory, 'yak.exe'), 'utf8')).toBe('user-selected')
    expect(fs.existsSync(path.join(directory, '.legacy-install.json'))).toBe(false)
  })

  it('仅 Windows Electron 22 属于兼容运行时', () => {
    expect(isWindowsLegacy('win32', '22.3.27')).toBe(true)
    expect(isWindowsLegacy('win32', '27.0.0')).toBe(false)
    expect(isWindowsLegacy('linux', '22.3.27')).toBe(false)
    expect(isWindowsLegacy('darwin', '22.3.27')).toBe(false)
  })
})

describe('引擎文件安装事务', () => {
  let temporaryDirectory
  let sourcePath
  let targetPath

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'renyan-engine-'))
    sourcePath = path.join(temporaryDirectory, 'downloaded-engine')
    targetPath = path.join(temporaryDirectory, 'yak.exe')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('打包工件缺失时选择仓库来源工件', () => {
    const packagedArchivePath = path.join(temporaryDirectory, 'bins', 'yak.zip')
    const sourceArchivePath = path.join(temporaryDirectory, 'bins', 'yak_windows_amd64.zip')
    fs.mkdirSync(path.dirname(sourceArchivePath), { recursive: true })
    fs.writeFileSync(sourceArchivePath, 'repository-engine')

    expect(selectBundledEngineArchivePath({ packagedArchivePath, sourceArchivePath })).toBe(sourceArchivePath)

    fs.writeFileSync(packagedArchivePath, 'packaged-engine')
    expect(selectBundledEngineArchivePath({ packagedArchivePath, sourceArchivePath })).toBe(packagedArchivePath)

    fs.unlinkSync(packagedArchivePath)
    fs.unlinkSync(sourceArchivePath)
    expect(selectBundledEngineArchivePath({ packagedArchivePath, sourceArchivePath })).toBe(packagedArchivePath)
  })

  it('验证摘要后替换活动引擎并保留最后可用版本', async () => {
    fs.writeFileSync(sourcePath, 'new-engine')
    fs.writeFileSync(targetPath, 'old-engine')
    const expectedSha256 = await calculateFileSha256(sourcePath)

    const result = await atomicInstallEngine({ sourcePath, targetPath, expectedSha256 })

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('new-engine')
    expect(fs.readFileSync(`${targetPath}.last-good`, 'utf8')).toBe('old-engine')
    expect(result).toEqual({
      targetPath,
      backupPath: `${targetPath}.last-good`,
      sha256: expectedSha256,
      previousVersionPreserved: true,
    })
  })

  it('摘要不匹配时不修改活动引擎', async () => {
    fs.writeFileSync(sourcePath, 'untrusted-engine')
    fs.writeFileSync(targetPath, 'working-engine')

    await expect(atomicInstallEngine({ sourcePath, targetPath, expectedSha256: '0'.repeat(64) })).rejects.toMatchObject(
      { code: 'ENGINE_SHA256_MISMATCH' },
    )

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('working-engine')
    expect(fs.existsSync(`${targetPath}.installing`)).toBe(false)
  })

  it('激活失败时恢复原活动引擎', async () => {
    fs.writeFileSync(sourcePath, 'new-engine')
    fs.writeFileSync(targetPath, 'working-engine')
    const expectedSha256 = await calculateFileSha256(sourcePath)
    const nativeRename = fs.renameSync.bind(fs)

    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (from === `${targetPath}.installing` && to === targetPath) {
        const error = new Error('target is locked')
        error.code = 'EPERM'
        throw error
      }
      return nativeRename(from, to)
    })

    await expect(atomicInstallEngine({ sourcePath, targetPath, expectedSha256 })).rejects.toThrow('target is locked')

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('working-engine')
    expect(fs.existsSync(`${targetPath}.installing.json`)).toBe(false)
  })

  it('上次安装在活动文件替换前中断时恢复旧版本', async () => {
    const rollbackPath = `${targetPath}.rollback`
    const stagePath = `${targetPath}.installing`
    const markerPath = `${targetPath}.installing.json`
    fs.writeFileSync(rollbackPath, 'working-engine')
    fs.writeFileSync(stagePath, 'new-engine')
    fs.writeFileSync(
      markerPath,
      JSON.stringify({
        expectedSha256: await calculateFileSha256(stagePath),
        previousSha256: await calculateFileSha256(rollbackPath),
        phase: 'target-moved',
      }),
    )

    const result = await recoverInterruptedEngineInstall(targetPath)

    expect(result).toEqual({ recovered: true, source: 'rollback' })
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('working-engine')
    expect(fs.existsSync(stagePath)).toBe(false)
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('摘要比较忽略大小写和首尾空白', async () => {
    fs.writeFileSync(sourcePath, 'engine')
    const expectedSha256 = (await calculateFileSha256(sourcePath)).toUpperCase()

    await expect(verifyFileSha256(sourcePath, `  ${expectedSha256}\n`)).resolves.toEqual({
      valid: true,
      expected: expectedSha256.toLowerCase(),
      actual: expectedSha256.toLowerCase(),
    })
  })

  it('下载完成后验证临时文件并保留旧缓存', async () => {
    fs.writeFileSync(targetPath, 'old-cache')
    const expectedSource = path.join(temporaryDirectory, 'expected-engine')
    fs.writeFileSync(expectedSource, 'downloaded-engine')
    const expectedSha256 = await calculateFileSha256(expectedSource)

    const result = await downloadAndVerifyArtifact({
      targetPath,
      fetchExpectedSha256: async () => expectedSha256,
      download: async (temporaryPath) => fs.writeFileSync(temporaryPath, 'downloaded-engine'),
    })

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('downloaded-engine')
    expect(fs.readFileSync(`${targetPath}.last-good`, 'utf8')).toBe('old-cache')
    expect(fs.readFileSync(result.sidecarPath, 'utf8').trim()).toBe(expectedSha256)
  })

  it('下载失败时保留原缓存并清理临时文件', async () => {
    fs.writeFileSync(targetPath, 'old-cache')

    await expect(
      downloadAndVerifyArtifact({
        targetPath,
        fetchExpectedSha256: async () => '1'.repeat(64),
        download: async (temporaryPath) => {
          fs.writeFileSync(temporaryPath, 'partial-download')
          throw new Error('network unavailable')
        },
      }),
    ).rejects.toThrow('network unavailable')

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('old-cache')
    expect(fs.existsSync(`${targetPath}.download`)).toBe(false)
  })

  it('下载文件摘要不匹配时保留原缓存', async () => {
    fs.writeFileSync(targetPath, 'old-cache')

    await expect(
      downloadAndVerifyArtifact({
        targetPath,
        fetchExpectedSha256: async () => '2'.repeat(64),
        download: async (temporaryPath) => fs.writeFileSync(temporaryPath, 'tampered-engine'),
      }),
    ).rejects.toMatchObject({ code: 'ENGINE_SHA256_MISMATCH' })

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('old-cache')
    expect(fs.existsSync(`${targetPath}.download`)).toBe(false)
  })

  it('无效压缩包产生明确的提取失败', async () => {
    const archivePath = path.join(temporaryDirectory, 'invalid.zip')
    fs.writeFileSync(archivePath, 'not-a-zip')

    await expect(extractArchiveEntry(archivePath, 'bins/yak.exe', sourcePath)).rejects.toBeTruthy()
    expect(fs.existsSync(sourcePath)).toBe(false)
  })

  it('压缩包摘要变化但内部引擎摘要一致时仍可提取', async () => {
    const archivePath = path.join(temporaryDirectory, 'rebuilt.zip')
    const engineContent = Buffer.from('verified-engine')
    const archive = new AdmZip()
    archive.addFile('bins/yak.exe', engineContent)
    archive.writeZip(archivePath)
    const enginePath = path.join(temporaryDirectory, 'verified-yak.exe')
    const expectedPath = path.join(temporaryDirectory, 'expected-yak.exe')
    fs.writeFileSync(expectedPath, engineContent)
    const engineSha256 = await calculateFileSha256(expectedPath)

    const result = await extractAndVerifyEngineArchive({
      archivePath,
      archiveSha256: '0'.repeat(64),
      entryName: 'bins/yak.exe',
      destination: enginePath,
      engineSha256,
    })

    expect(result.archiveVerified).toBe(false)
    expect(result.engineVerification).toMatchObject({ valid: true, expected: engineSha256, actual: engineSha256 })
    expect(fs.readFileSync(enginePath)).toEqual(engineContent)

    await expect(
      extractAndVerifyEngineArchive({
        archivePath,
        archiveSha256: '0'.repeat(64),
        entryName: 'bins/yak.exe',
        destination: path.join(temporaryDirectory, 'rejected-yak.exe'),
        engineSha256: 'f'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'ENGINE_SHA256_MISMATCH' })
  })

  const compatibility = getCompatibilityEntry({ platform: 'win32', architecture: 'x64' })
  const bundledArchivePath = compatibility ? path.resolve(compatibility.artifact.sourceArchive) : ''
  const bundledArtifactTest = bundledArchivePath && fs.existsSync(bundledArchivePath) ? it : it.skip

  bundledArtifactTest(
    '验证并提取当前 Windows 预置引擎工件',
    async () => {
      await verifyFileSha256(bundledArchivePath, compatibility.artifact.archiveSha256)
      await extractArchiveEntry(bundledArchivePath, compatibility.artifact.archiveEntry, sourcePath)
      await expect(verifyFileSha256(sourcePath, compatibility.artifact.engineSha256)).resolves.toMatchObject({
        valid: true,
      })
    },
    300_000,
  )
})
