import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { createProjectArchiveStore } from '../../projectArchive'
import { afterEach, describe, expect, it, vi } from 'vitest'

const directories = []
afterEach(() => {
  directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }))
})

const setupExport = (remoteContent) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-export-test-'))
  directories.push(directory)
  const handlers = new Map()
  const events = []
  const stream = new EventEmitter()
  stream.cancel = vi.fn()
  const readFile = vi.fn(({ FilePath }) => {
    const content = remoteContent || fs.readFileSync(FilePath)
    const reader = Readable.from([{ Data: content, EOF: true }])
    reader.cancel = () => reader.destroy(new Error('导出已取消'))
    return reader
  })
  let finish
  const ended = new Promise((resolve) => {
    finish = resolve
  })
  const win = {
    webContents: {
      send: (channel, data) => {
        events.push({ channel, data })
        if (channel === 'test-end') finish()
      },
    },
  }
  const filename = path.resolve('app/main/handlers/project.js')
  const requireActual = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    {
      module,
      require: (name) => {
        if (name === 'electron') return { ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }
        if (name === '../projectArchive')
          return { createProjectArchiveStore: () => createProjectArchiveStore(path.join(directory, 'exports')) }
        if (name === '../filePath') return { getAppConfigDir: () => directory }
        if (name === '../projectShareBundle') return { createProjectShareBundleStore: () => ({}) }
        if (name === '../projectShareRecoveryStore') return { createProjectShareRecoveryStore: () => ({}) }
        if (name === '../projectShareIPC') return { registerProjectShareIPC: () => {} }
        return requireActual(name)
      },
    },
    { filename },
  )
  const exportProject = vi.fn(() => stream)
  module.exports(win, () => ({ ExportProject: exportProject, ReadFile: readFile }))
  handlers.get('ExportProject')({}, { Id: 12, Password: '' }, 'test')
  return { directory, stream, events, ended, handlers, exportProject, readFile }
}

describe('项目导出文件交付', () => {
  it('空归档不报告完成并清理本次创建的文件', async () => {
    const task = setupExport(Buffer.alloc(0))
    task.stream.emit('data', { TargetPath: '/remote/empty.yakitproject', Percent: 1 })
    task.stream.emit('end')
    await task.ended
    expect(task.events.some((event) => event.channel === 'test-error')).toBe(true)
    expect(fs.readdirSync(path.join(task.directory, 'exports'))).toEqual([])
  })

  it('引擎文件读取失败时保留错误并清理未完成归档', async () => {
    const task = setupExport()
    task.readFile.mockImplementation(() => {
      throw new Error('读取中断')
    })
    task.stream.emit('data', { TargetPath: '/remote/project.yakitproject', Percent: 1 })
    task.stream.emit('end')
    await task.ended
    expect(task.events).toContainEqual({ channel: 'test-error', data: '项目导出文件整理失败：读取中断' })
    expect(fs.readdirSync(path.join(task.directory, 'exports'))).toEqual([])
  })

  it('文件交付阶段仍可取消，并清理本次创建的归档', async () => {
    const task = setupExport()
    let markReady
    const ready = new Promise((resolve) => {
      markReady = resolve
    })
    const reader = new Readable({ objectMode: true, read() {} })
    reader.cancel = vi.fn(() => reader.destroy(new Error('读取已取消')))
    task.readFile.mockImplementation(() => {
      markReady()
      return reader
    })
    task.stream.emit('data', { TargetPath: '/remote/project.yakitproject', Percent: 1 })
    task.stream.emit('end')
    await Promise.race([ready, task.ended])
    expect(task.readFile).toHaveBeenCalled()
    await task.handlers.get('cancel-ExportProject')({}, 'test')
    await task.ended
    expect(reader.cancel).toHaveBeenCalled()
    expect(task.events.some((event) => event.channel === 'test-error')).toBe(true)
    expect(fs.readdirSync(path.join(task.directory, 'exports'))).toEqual([])
  })

  it('通过引擎读取远端归档，不将远端路径当作本机文件', async () => {
    const bytes = Buffer.from('remote-project-archive')
    const task = setupExport(bytes)
    task.stream.emit('data', { TargetPath: '/remote/project-default.yakitproject', Percent: 1 })
    task.stream.emit('end')
    await task.ended
    expect(task.readFile).toHaveBeenCalledWith({
      FilePath: '/remote/project-default.yakitproject',
      BufSize: 1048576,
      FileSystem: 'local',
    })
    const target = task.events.filter((event) => event.channel === 'test-data').at(-1).data.TargetPath
    expect(fs.readFileSync(target)).toEqual(bytes)
    expect(target).toMatch(/\.ruiyanproject$/)
  })

  it.each(['.yakitproject', '.yakitproject.enc'])('导出 %s 后保留全部字节并返回睿眼文件名', async (extension) => {
    const task = setupExport()
    const sourcePath = path.join(task.directory, `project-default${extension}`)
    const bytes = Buffer.from([0, 1, 255, 32, 128, 10])
    fs.writeFileSync(sourcePath, bytes)
    task.stream.emit('data', { TargetPath: sourcePath, Percent: 1, Verbose: '导出成功' })
    task.stream.emit('end')
    await task.ended
    const target = task.events.filter((event) => event.channel === 'test-data').at(-1).data.TargetPath
    expect(path.dirname(target)).toBe(path.join(task.directory, 'exports'))
    expect(target).toMatch(extension.endsWith('.enc') ? /\.ruiyanproject\.enc$/ : /\.ruiyanproject$/)
    expect(fs.readFileSync(target)).toEqual(bytes)
    expect(fs.readFileSync(sourcePath)).toEqual(bytes)
    expect(task.events.some((event) => event.channel === 'test-error')).toBe(false)
    expect(task.exportProject).toHaveBeenCalledWith({ Id: 12, Password: '' })
  })

  it('遇到同名睿眼归档时保留旧文件并产生独立的新文件', async () => {
    const task = setupExport()
    const sourcePath = path.join(task.directory, 'project-default.yakitproject')
    fs.mkdirSync(path.join(task.directory, 'exports'), { recursive: true })
    const existingPath = path.join(task.directory, 'exports', 'project-default.ruiyanproject')
    fs.writeFileSync(sourcePath, 'new-project')
    fs.writeFileSync(existingPath, 'existing-project')
    task.stream.emit('data', { TargetPath: sourcePath, Percent: 1 })
    task.stream.emit('end')
    await task.ended
    const target = task.events.filter((event) => event.channel === 'test-data').at(-1).data.TargetPath
    expect(target).toMatch(/\.ruiyanproject$/)
    expect(target).not.toBe(existingPath)
    expect(fs.readFileSync(target, 'utf8')).toBe('new-project')
    expect(fs.readFileSync(existingPath, 'utf8')).toBe('existing-project')
  })

  it('引擎报错后不改动文件或发布完成路径', async () => {
    const task = setupExport()
    const sourcePath = path.join(task.directory, 'project-default.yakitproject')
    fs.writeFileSync(sourcePath, 'partial')
    task.stream.emit('data', { TargetPath: sourcePath, Percent: 0.5 })
    task.stream.emit('error', { details: '导出中断' })
    task.stream.emit('end')
    await task.ended
    expect(fs.readFileSync(sourcePath, 'utf8')).toBe('partial')
    expect(task.events).toContainEqual({ channel: 'test-error', data: '导出中断' })
    expect(task.events.filter((event) => event.channel === 'test-data').every((event) => event.data.Percent < 1)).toBe(
      true,
    )
  })
})
