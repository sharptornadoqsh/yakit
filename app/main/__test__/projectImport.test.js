// @vitest-environment node
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { EventEmitter } from 'events'
import {
  inspectProjectImportFile,
  prepareProjectImport,
  importProjectWithReceipt,
  runProjectStream,
  callProjectRpc,
} from '../projectImport'

let directory
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'project-import-'))
})
afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

const database = () => {
  const bytes = Buffer.alloc(4096)
  bytes.write('SQLite format 3\0')
  bytes.writeUInt16BE(4096, 16)
  bytes[18] = bytes[19] = 1
  bytes[21] = 64
  bytes[22] = bytes[23] = 32
  bytes.writeUInt32BE(1, 28)
  return bytes
}
const archive = (bytes = database()) =>
  zlib.gzipSync(Buffer.concat([Buffer.from([4]), Buffer.from('demo'), Buffer.from([0, 2]), Buffer.from('{}'), bytes]))
const write = (name, bytes) => {
  const file = path.join(directory, name)
  fs.writeFileSync(file, bytes)
  return file
}

describe('项目内容预检（容器及数据库头，不替代 SQLite 完整性检查）', () => {
  it.each(['.ruiyanproject', '.ruiyanproject.enc', '.yakitproject', '.yakitproject.enc', '.db', '.sqlite', '.sqlite3'])(
    '按内容而不是 %s 判断未加密文件',
    async (extension) => {
      const file = write(`project${extension}`, archive())
      await expect(inspectProjectImportFile(file)).resolves.toMatchObject({
        format: 'project-archive',
        encrypted: false,
      })
      await expect(prepareProjectImport({ ProjectFilePath: file, Password: 'redundant' })).resolves.toMatchObject({
        Password: '',
      })
    },
  )
  it.each(['<!DOCTYPE html><html>report</html>', '\uFEFF <html>report</html>', '%PDF-1.7 report'])(
    '伪装项目后缀的报告在调用引擎前失败',
    async (content) => {
      await expect(inspectProjectImportFile(write('fake.ruiyanproject', content))).rejects.toThrow('REPORT_NOT_PROJECT')
    },
  )
  it('区分空文件、未知格式、截断压缩内容、无效元数据和无效数据库', async () => {
    for (const [name, content, code] of [
      ['empty.db', Buffer.alloc(0), 'FILE_EMPTY'],
      ['fake.db', 'not sqlite', 'FORMAT_INVALID'],
      ['broken.ruiyanproject', archive().subarray(0, -4), 'ARCHIVE_DAMAGED'],
      ['invalid.ruiyanproject', zlib.gzipSync('plain text'), 'FORMAT_INVALID'],
      ['invalid-db.ruiyanproject', archive(Buffer.from('not sqlite')), 'DATABASE_INVALID'],
      ['truncated.db', database().subarray(0, 1024), 'DATABASE_DAMAGED'],
    ])
      await expect(inspectProjectImportFile(write(name, content))).rejects.toThrow(code)
    await expect(inspectProjectImportFile(directory)).rejects.toThrow('请选择文件')
  })
  it('真实加密标志要求密码，不使用 .enc 作为判断依据', async () => {
    const file = write(
      'encrypted.db',
      Buffer.concat([Buffer.from([255, 255, 255, 255]), zlib.gzipSync('encrypted-body')]),
    )
    await expect(inspectProjectImportFile(file)).resolves.toMatchObject({ encrypted: true })
    await expect(prepareProjectImport({ ProjectFilePath: file })).rejects.toThrow('PASSWORD_REQUIRED')
    await expect(prepareProjectImport({ ProjectFilePath: file, Password: 'secret' })).resolves.toMatchObject({
      Password: 'secret',
    })
  })
  it('取消前置校验不生成临时文件', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      inspectProjectImportFile(write('project.db', database()), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fs.readdirSync(directory)).toEqual(['project.db'])
  })
})

describe('导入收据与流终态', () => {
  it('预检使用的单次 RPC 带截止时间，取消会停止调用', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const client = {
      IsProjectNameValid: vi.fn((_params, options) => {
        expect(options.deadline).toBeGreaterThan(Date.now())
        expect(options.deadline).toBeLessThanOrEqual(Date.now() + 15000)
        return { cancel }
      }),
    }
    const pending = callProjectRpc(client, 'IsProjectNameValid', {}, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  const setup = (
    finish = (stream) => {
      stream.emit('end')
      stream.emit('status', { code: 0 })
      stream.emit('close')
    },
  ) => {
    const file = write('project.db', database())
    const stream = new EventEmitter()
    stream.cancel = vi.fn(() => {
      stream.emit('error', new Error('cancelled'))
      stream.emit('close')
    })
    const client = {
      IsProjectNameValid: vi.fn((_params, _options, callback) => {
        callback(null, {})
        return { cancel: vi.fn() }
      }),
      GetProjects: vi.fn((_params, _options, callback) =>
        callback(null, {
          Projects: [
            { Id: 9, ProjectName: 'local', DatabasePath: file, FolderId: 2, ChildFolderId: 3, Type: 'project' },
          ],
        }),
      ),
      ImportProject: vi.fn(() => {
        queueMicrotask(() => finish(stream))
        return stream
      }),
    }
    const params = {
      LocalProjectName: 'local',
      ProjectFilePath: file,
      Password: 'unused',
      FolderId: 2,
      ChildFolderId: 3,
      Type: 'project',
    }
    return { client, params, stream }
  }
  it('成功须有 OK 状态、唯一项目记录和可读数据库头，且不切换当前项目', async () => {
    const { client, params, stream } = setup()
    await expect(importProjectWithReceipt(client, params)).resolves.toMatchObject({
      ProjectId: 9,
      Validation: 'container-header',
    })
    expect(client.ImportProject).toHaveBeenCalledWith({ ...params, Password: '' })
    expect(stream.eventNames()).toEqual([])
  })
  it('只有 end 或 100% 之后断开仍失败', async () => {
    const { client, params, stream } = setup((stream) => {
      stream.emit('data', { Percent: 1 })
      stream.emit('end')
      stream.emit('close')
    })
    await expect(importProjectWithReceipt(client, params)).rejects.toThrow('ENGINE_DISCONNECTED')
    expect(client.GetProjects).not.toHaveBeenCalled()
    expect(stream.eventNames()).toEqual([])
  })
  it('结束后找不到项目记录不报告成功', async () => {
    const { client, params } = setup()
    client.GetProjects.mockImplementation((_params, _options, callback) => callback(null, { Projects: [] }))
    await expect(importProjectWithReceipt(client, params)).rejects.toThrow('IMPORT_UNCONFIRMED')
  })
  it('同名校验失败不启动写入流', async () => {
    const { client, params } = setup()
    client.IsProjectNameValid.mockImplementation((_params, _options, callback) => callback(new Error('名称冲突')))
    await expect(importProjectWithReceipt(client, params)).rejects.toThrow('名称冲突')
    expect(client.ImportProject).not.toHaveBeenCalled()
  })
  it('连续两次失败后第三次成功，未触碰原文件', async () => {
    const { client, params } = setup()
    const bad = write('bad.ruiyanproject', archive().subarray(0, -6))
    for (let i = 0; i < 2; i++)
      await expect(importProjectWithReceipt(client, { ...params, ProjectFilePath: bad })).rejects.toThrow(
        'ARCHIVE_DAMAGED',
      )
    await expect(importProjectWithReceipt(client, params)).resolves.toMatchObject({ ProjectId: 9 })
    expect(client.ImportProject).toHaveBeenCalledTimes(1)
    expect(fs.readFileSync(params.ProjectFilePath)).toEqual(database())
  })
  it('超时取消流并清理，迟到成功不改变结果', async () => {
    const { client, params, stream } = setup(() => {})
    const pending = runProjectStream(client, 'ImportProject', params, { timeoutMs: 5 })
    await expect(pending).rejects.toThrow('TRANSFER_TIMEOUT')
    stream.emit('end')
    stream.emit('status', { code: 0 })
    expect(stream.cancel).toHaveBeenCalledTimes(1)
    expect(stream.eventNames()).toEqual([])
  })
})
