import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectArchiveStore } from '../projectArchive'

const temporaryDirectories = []

const createTemporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'team-project-archive-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
})

describe('团队项目归档文件', () => {
  it('按字节分块读取并计算完整文件摘要', async () => {
    const directory = createTemporaryDirectory()
    const sourcePath = path.join(directory, 'source.yakitproject')
    const content = Buffer.from('project-archive-content')
    fs.writeFileSync(sourcePath, content)
    const store = createProjectArchiveStore(path.join(directory, 'managed'))

    const inspected = await store.inspectArchive(sourcePath)
    const first = await store.readArchiveChunk({ filePath: sourcePath, offset: 0, length: 7 })
    const second = await store.readArchiveChunk({
      filePath: sourcePath,
      offset: first.length,
      length: content.length - first.length,
    })

    expect(inspected).toEqual({
      fileName: 'source.yakitproject',
      filePath: sourcePath,
      size: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    })
    expect(Buffer.concat([Buffer.from(first.data, 'base64'), Buffer.from(second.data, 'base64')])).toEqual(content)
  })

  it('在受控目录依次写入分块并验证重建文件', async () => {
    const directory = createTemporaryDirectory()
    const managedDirectory = path.join(directory, 'managed')
    const content = Buffer.from('complete-team-project')
    const store = createProjectArchiveStore(managedDirectory)
    const created = await store.createArchive({ fileName: '../shared.yakitproject' })
    const first = content.subarray(0, 8)
    const second = content.subarray(8)

    await store.writeArchiveChunk({ filePath: created.filePath, offset: 0, data: first.toString('base64') })
    await store.writeArchiveChunk({
      filePath: created.filePath,
      offset: first.length,
      data: second.toString('base64'),
    })

    const finalized = await store.finalizeArchive(created.filePath)
    expect(path.relative(managedDirectory, created.filePath)).not.toMatch(/^\.\./)
    expect(finalized.size).toBe(content.length)
    expect(finalized.sha256).toBe(crypto.createHash('sha256').update(content).digest('hex'))
    expect(fs.readFileSync(created.filePath)).toEqual(content)
  })

  it('拒绝写入受控目录之外的文件', async () => {
    const directory = createTemporaryDirectory()
    const store = createProjectArchiveStore(path.join(directory, 'managed'))

    await expect(
      store.writeArchiveChunk({
        filePath: path.join(directory, 'outside.yakitproject'),
        offset: 0,
        data: Buffer.from('outside').toString('base64'),
      }),
    ).rejects.toThrow('归档路径不在受控目录内')
  })
})
