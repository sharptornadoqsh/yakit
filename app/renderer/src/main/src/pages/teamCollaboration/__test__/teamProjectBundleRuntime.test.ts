import { vi } from 'vitest'
import * as teamCollaboration from '@/services/teamCollaboration'
import { PROJECT_BUNDLE_DATA_TYPE } from '../projectBundleData'
import { runProjectTransfer, type ProjectTransferIpc } from '../projectTransfer'
import { createDefaultTeamProjectBundleDependencies } from '../teamProjectBundleRuntime'

vi.mock('@/services/teamCollaboration', () => ({
  listTestData: vi.fn(),
}))

vi.mock('@/utils/envfile', () => ({
  getRemoteHttpSettingGV: vi.fn(() => 'remote-http-setting'),
  isIRify: vi.fn(() => false),
}))

const createIpc = () => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const ipc: ProjectTransferIpc & { emit: (channel: string, value?: unknown) => void } = {
    invoke: vi.fn(async () => undefined),
    on: vi.fn((channel, listener) => {
      const channelListeners = listeners.get(channel) || new Set()
      channelListeners.add(listener)
      listeners.set(channel, channelListeners)
      return ipc
    }),
    removeListener: vi.fn((channel, listener) => {
      listeners.get(channel)?.delete(listener)
      return ipc
    }),
    emit: (channel, value) => listeners.get(channel)?.forEach((listener) => listener({}, value)),
  }
  return ipc
}

describe('项目导入导出流适配', () => {
  it('在结束事件到达后返回导出路径并移除监听器', async () => {
    const ipc = createIpc()
    const progress = vi.fn()
    vi.mocked(ipc.invoke).mockImplementation(async (_channel, _params, token) => {
      queueMicrotask(() => {
        ipc.emit(`${token}-data`, { TargetPath: 'D:/export/project.yakitproject', Percent: 1, Verbose: 'done' })
        ipc.emit(`${token}-end`)
      })
    })

    await expect(
      runProjectTransfer(ipc, {
        channel: 'ExportProject',
        params: { Id: 7, Password: '' },
        token: 'transfer-success',
        requireTargetPath: true,
        onProgress: progress,
      }),
    ).resolves.toBe('D:/export/project.yakitproject')
    expect(progress).toHaveBeenCalledWith({ TargetPath: 'D:/export/project.yakitproject', Percent: 1, Verbose: 'done' })
    expect(ipc.removeListener).toHaveBeenCalledTimes(3)
  })

  it('错误事件到达时拒绝操作且不等待结束事件', async () => {
    const ipc = createIpc()
    vi.mocked(ipc.invoke).mockImplementation(async (_channel, _params, token) => {
      queueMicrotask(() => ipc.emit(`${token}-error`, '导出失败'))
    })

    await expect(
      runProjectTransfer(ipc, {
        channel: 'ExportProject',
        params: { Id: 7, Password: '' },
        token: 'transfer-error',
        requireTargetPath: true,
      }),
    ).rejects.toThrow('导出失败')
    expect(ipc.removeListener).toHaveBeenCalledTimes(3)
  })

  it('导出当前项目时关闭数据库连接，导出结束后恢复原项目', async () => {
    const ipc = createIpc()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: ipc })),
    })
    vi.mocked(ipc.invoke).mockImplementation(async (channel, _params, token) => {
      if (channel === 'GetCurrentProjectEx') {
        return { Id: 7, ProjectName: '当前项目', Type: 'project' }
      }
      if (channel === 'ExportProject') {
        queueMicrotask(() => {
          ipc.emit(`${token}-data`, { TargetPath: 'D:/export/current.yakitproject', Percent: 1 })
          ipc.emit(`${token}-end`)
        })
      }
      return undefined
    })

    const dependencies = createDefaultTeamProjectBundleDependencies()

    await expect(dependencies.exportLocalProject({ id: 7, name: '当前项目', type: 'project' })).resolves.toBe(
      'D:/export/current.yakitproject',
    )
    expect(ipc.invoke).toHaveBeenCalledWith('SetCurrentProject', { Id: 0, ProjectName: '', Type: 'project' })
    expect(ipc.invoke).toHaveBeenLastCalledWith('SetCurrentProject', {
      Id: 7,
      ProjectName: '当前项目',
      Type: 'project',
    })
  })

  it('导出非当前项目时不切换项目数据库', async () => {
    const ipc = createIpc()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: ipc })),
    })
    vi.mocked(ipc.invoke).mockImplementation(async (channel, _params, token) => {
      if (channel === 'GetCurrentProjectEx') {
        return { Id: 8, ProjectName: '其他项目', Type: 'project' }
      }
      if (channel === 'ExportProject') {
        queueMicrotask(() => {
          ipc.emit(`${token}-data`, { TargetPath: 'D:/export/background.yakitproject', Percent: 1 })
          ipc.emit(`${token}-end`)
        })
      }
      return undefined
    })

    const dependencies = createDefaultTeamProjectBundleDependencies()

    await expect(dependencies.exportLocalProject({ id: 7, name: '待导出项目', type: 'project' })).resolves.toBe(
      'D:/export/background.yakitproject',
    )
    expect(ipc.invoke).not.toHaveBeenCalledWith('SetCurrentProject', expect.anything())
  })

  it('当前项目导出失败后仍恢复原项目', async () => {
    const ipc = createIpc()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: ipc })),
    })
    vi.mocked(ipc.invoke).mockImplementation(async (channel, _params, token) => {
      if (channel === 'GetCurrentProjectEx') {
        return { Id: 7, ProjectName: '当前项目', Type: 'project' }
      }
      if (channel === 'ExportProject') {
        queueMicrotask(() => ipc.emit(`${token}-error`, '导出失败'))
      }
      return undefined
    })

    const dependencies = createDefaultTeamProjectBundleDependencies()

    await expect(dependencies.exportLocalProject({ id: 7, name: '当前项目', type: 'project' })).rejects.toThrow(
      '导出失败',
    )
    expect(ipc.invoke).toHaveBeenLastCalledWith('SetCurrentProject', {
      Id: 7,
      ProjectName: '当前项目',
      Type: 'project',
    })
  })

  it('使用服务端 type 查询参数分页读取归档分块', async () => {
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: createIpc() })),
    })
    vi.mocked(teamCollaboration.listTestData).mockResolvedValue({ data: [{ id: 91 }] } as never)

    const dependencies = createDefaultTeamProjectBundleDependencies()

    await expect(dependencies.listTestData(3, 7)).resolves.toEqual([{ id: 91 }])
    expect(teamCollaboration.listTestData).toHaveBeenCalledWith(3, 7, {
      page: 1,
      limit: 100,
      type: PROJECT_BUNDLE_DATA_TYPE,
    })
  })

  it('覆盖同名项目时先生成可校验备份，再删除并导入团队归档', async () => {
    const ipc = createIpc()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: ipc })),
    })
    vi.mocked(ipc.invoke).mockImplementation(async (channel, _params, token) => {
      if (channel === 'ExportProject') {
        queueMicrotask(() => {
          ipc.emit(`${token}-data`, { TargetPath: 'D:/backup/original.yakitproject', Percent: 1 })
          ipc.emit(`${token}-end`)
        })
        return
      }
      if (channel === 'InspectProjectArchive') {
        return { fileName: 'original.yakitproject', filePath: 'D:/backup/original.yakitproject', size: 9, sha256: 'a' }
      }
      if (channel === 'ImportProject') {
        queueMicrotask(() => ipc.emit(`${token}-end`))
        return
      }
      if (channel === 'GetProjects') {
        return { Projects: [{ Id: 92, ProjectName: '共享项目' }] }
      }
      return undefined
    })

    const dependencies = createDefaultTeamProjectBundleDependencies()
    const result = await dependencies.replaceLocalProjectFromArchive('D:/managed/team.yakitproject', {
      id: 81,
      name: '共享项目',
      type: 'project',
    })

    const channels = vi.mocked(ipc.invoke).mock.calls.map(([channel]) => channel)
    expect(channels.indexOf('InspectProjectArchive')).toBeLessThan(channels.indexOf('DeleteProject'))
    expect(channels.indexOf('DeleteProject')).toBeLessThan(channels.indexOf('ImportProject'))
    expect(ipc.invoke).toHaveBeenCalledWith('DeleteProject', { Id: 81, IsDeleteLocal: true, Type: 'project' })
    expect(result).toEqual({
      id: 92,
      name: '共享项目',
      type: 'project',
      backupPath: 'D:/backup/original.yakitproject',
    })
  })

  it('覆盖导入失败时使用备份恢复原项目', async () => {
    const ipc = createIpc()
    let importCount = 0
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: ipc })),
    })
    vi.mocked(ipc.invoke).mockImplementation(async (channel, _params, token) => {
      if (channel === 'ExportProject') {
        queueMicrotask(() => {
          ipc.emit(`${token}-data`, { TargetPath: 'D:/backup/original.yakitproject', Percent: 1 })
          ipc.emit(`${token}-end`)
        })
        return
      }
      if (channel === 'InspectProjectArchive') {
        return { fileName: 'original.yakitproject', filePath: 'D:/backup/original.yakitproject', size: 9, sha256: 'a' }
      }
      if (channel === 'ImportProject') {
        importCount += 1
        queueMicrotask(() => {
          if (importCount === 1) ipc.emit(`${token}-error`, '团队归档无效')
          else ipc.emit(`${token}-end`)
        })
        return
      }
      if (channel === 'GetProjects') {
        return { Projects: [{ Id: 93, ProjectName: '共享项目' }] }
      }
      return undefined
    })

    const dependencies = createDefaultTeamProjectBundleDependencies()

    await expect(
      dependencies.replaceLocalProjectFromArchive('D:/managed/team.yakitproject', {
        id: 81,
        name: '共享项目',
        type: 'project',
      }),
    ).rejects.toThrow('原项目已从备份恢复')
    expect(importCount).toBe(2)
    expect(ipc.invoke).toHaveBeenCalledWith(
      'ImportProject',
      expect.objectContaining({ ProjectFilePath: 'D:/backup/original.yakitproject' }),
      expect.any(String),
    )
  })

  it('备份为空时禁止删除同名本地项目', async () => {
    const ipc = createIpc()
    Object.defineProperty(window, 'require', {
      configurable: true,
      value: vi.fn(() => ({ ipcRenderer: ipc })),
    })
    vi.mocked(ipc.invoke).mockImplementation(async (channel, _params, token) => {
      if (channel === 'ExportProject') {
        queueMicrotask(() => {
          ipc.emit(`${token}-data`, { TargetPath: 'D:/backup/empty.yakitproject', Percent: 1 })
          ipc.emit(`${token}-end`)
        })
      }
      if (channel === 'InspectProjectArchive') {
        return { fileName: 'empty.yakitproject', filePath: 'D:/backup/empty.yakitproject', size: 0, sha256: '' }
      }
      return undefined
    })

    const dependencies = createDefaultTeamProjectBundleDependencies()

    await expect(
      dependencies.replaceLocalProjectFromArchive('D:/managed/team.yakitproject', {
        id: 81,
        name: '共享项目',
        type: 'project',
      }),
    ).rejects.toThrow('同名本地项目备份为空')
    expect(ipc.invoke).not.toHaveBeenCalledWith('DeleteProject', expect.anything())
  })
})
