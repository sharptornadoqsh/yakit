import { describe, expect, it, vi } from 'vitest'
import { installTeamPluginDownload } from '../teamPluginInstall'

describe('团队插件本地安装', () => {
  it('校验正文后保存插件、分类分组和远端映射', async () => {
    const savePlugin = vi.fn().mockResolvedValue({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' })
    const saveGroups = vi.fn().mockResolvedValue(undefined)
    const saveMapping = vi.fn().mockResolvedValue(undefined)

    const result = await installTeamPluginDownload(
      {
        id: 5,
        scriptName: 'scanner',
        type: 'yak',
        uuid: 'remote-uuid',
        description: '远端插件描述',
        fileHash: 'expected-hash',
        revision: 4,
        visibility: 'team',
        categoryId: 3,
        categoryName: '扫描',
        groupIds: [8, 9],
        groupNames: ['扫描', '红队'],
      },
      {
        onlineBaseUrl: 'https://online.example',
        download: () => Promise.resolve(new Blob(['println(1)'])),
        digest: () => Promise.resolve('expected-hash'),
        savePlugin,
        saveGroups,
        saveMapping,
      },
    )

    expect(savePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        ScriptName: 'scanner',
        Type: 'yak',
        Content: 'println(1)',
        Help: '远端插件描述',
        UUID: 'remote-uuid',
        OnlineId: 5,
        OnlineBaseUrl: 'https://online.example',
      }),
    )
    expect(saveGroups).toHaveBeenCalledWith('scanner', ['扫描', '红队'])
    expect(saveMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        teamPluginId: 5,
        localPluginId: 17,
        localPluginUUID: 'local-uuid',
        revision: 4,
        fileHash: 'expected-hash',
      }),
    )
    expect(result.localPlugin).toMatchObject({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' })
  })

  it('摘要不一致时拒绝写入本机插件库', async () => {
    const savePlugin = vi.fn()
    await expect(
      installTeamPluginDownload(
        { id: 5, scriptName: 'scanner', type: 'yak', fileHash: 'expected-hash', revision: 1 },
        {
          download: () => Promise.resolve(new Blob(['changed'])),
          digest: () => Promise.resolve('actual-hash'),
          savePlugin,
        },
      ),
    ).rejects.toThrow('插件正文摘要校验失败')
    expect(savePlugin).not.toHaveBeenCalled()
  })

  it('空正文不创建本机插件', async () => {
    const savePlugin = vi.fn()
    await expect(
      installTeamPluginDownload(
        { id: 6, scriptName: 'empty', type: 'yak', revision: 1 },
        {
          download: () => Promise.resolve(new Blob([])),
          digest: () => Promise.resolve('unused'),
          savePlugin,
        },
      ),
    ).rejects.toThrow('团队插件正文为空')
    expect(savePlugin).not.toHaveBeenCalled()
  })

  it('接受 Electron 主进程返回的字节数组', async () => {
    const savePlugin = vi.fn().mockResolvedValue({ Id: 19, ScriptName: 'buffer-plugin' })
    const content = new TextEncoder().encode('println(4)')

    const result = await installTeamPluginDownload(
      { id: 11, scriptName: 'buffer-plugin', type: 'yak', fileHash: 'buffer-hash', revision: 1 },
      {
        download: () => Promise.resolve(content),
        digest: async (bytes) => {
          expect(new TextDecoder().decode(bytes)).toBe('println(4)')
          return 'buffer-hash'
        },
        savePlugin,
      },
    )

    expect(savePlugin).toHaveBeenCalledWith(expect.objectContaining({ Content: 'println(4)' }))
    expect(result.mapping?.localPluginId).toBe(19)
  })

  it('本地同名插件存在时默认拒绝静默覆盖', async () => {
    const download = vi.fn()
    const savePlugin = vi.fn()

    await expect(
      installTeamPluginDownload(
        { id: 7, scriptName: 'scanner', type: 'yak', revision: 1 },
        {
          findLocalPlugin: async () => ({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' }),
          download,
          savePlugin,
        },
      ),
    ).rejects.toThrow('本地已存在同名插件')
    expect(download).not.toHaveBeenCalled()
    expect(savePlugin).not.toHaveBeenCalled()
  })

  it('本地冲突选择副本时使用新名称保存', async () => {
    const savePlugin = vi.fn().mockResolvedValue({ Id: 18, ScriptName: 'scanner-copy', UUID: 'copy-uuid' })

    const result = await installTeamPluginDownload(
      { id: 8, scriptName: 'scanner', type: 'yak', revision: 2 },
      {
        findLocalPlugin: async (scriptName) =>
          scriptName === 'scanner' ? { Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' } : undefined,
        resolveLocalConflict: async () => ({ action: 'copy', scriptName: 'scanner-copy' }),
        download: () => Promise.resolve(new Blob(['println(2)'])),
        digest: () => Promise.resolve('copy-hash'),
        savePlugin,
      },
    )

    expect(savePlugin).toHaveBeenCalledWith(expect.objectContaining({ ScriptName: 'scanner-copy', UUID: '' }))
    expect(savePlugin.mock.calls[0][0]).not.toHaveProperty('Id')
    expect(result.mapping?.localScriptName).toBe('scanner-copy')
  })

  it('本地冲突选择覆盖时按原条目标识更新', async () => {
    const savePlugin = vi.fn().mockResolvedValue({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' })

    const result = await installTeamPluginDownload(
      { id: 10, scriptName: 'scanner', type: 'yak', uuid: 'remote-uuid', revision: 5 },
      {
        findLocalPlugin: async () => ({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' }),
        resolveLocalConflict: async () => ({ action: 'overwrite' }),
        download: () => Promise.resolve(new Blob(['println(3)'])),
        digest: () => Promise.resolve('overwrite-hash'),
        savePlugin,
      },
    )

    expect(savePlugin).toHaveBeenCalledWith(
      expect.objectContaining({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' }),
    )
    expect(result.mapping?.localPluginId).toBe(17)
  })

  it('本地冲突选择跳过时不下载正文', async () => {
    const download = vi.fn()
    const savePlugin = vi.fn()

    const result = await installTeamPluginDownload(
      { id: 9, scriptName: 'scanner', type: 'yak', revision: 3 },
      {
        findLocalPlugin: async () => ({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' }),
        resolveLocalConflict: async () => ({ action: 'skip' }),
        download,
        savePlugin,
      },
    )

    expect(result).toEqual({ skipped: true })
    expect(download).not.toHaveBeenCalled()
    expect(savePlugin).not.toHaveBeenCalled()
  })
})
