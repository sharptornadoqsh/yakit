import fs from 'fs'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
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
} from '../engineLifecycle'

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
