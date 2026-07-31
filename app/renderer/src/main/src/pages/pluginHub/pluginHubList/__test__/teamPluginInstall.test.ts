/// <reference types="vitest/globals" />

import { createHash } from 'crypto'
import { installTeamPluginDownload } from '../teamPluginInstall'

const sha256 = (character: string) => character.repeat(64)
const digestBytes = (content: Uint8Array) => createHash('sha256').update(content).digest('hex')

describe('团队插件本地安装', () => {
  it('归一化 ArrayBuffer、子视图和 Node Buffer 时只复制有效字节', async () => {
    const api = await import('../teamPluginInstall')
    const normalizeDownloadedPluginBytes = (api as any).normalizeDownloadedPluginBytes
    expect(typeof normalizeDownloadedPluginBytes).toBe('function')
    const raw = new Uint8Array([1, 2, 3]).buffer
    const normalizedRaw = normalizeDownloadedPluginBytes(raw)
    expect(normalizedRaw).not.toBe(raw)
    expect(Array.from(new Uint8Array(normalizedRaw))).toEqual([1, 2, 3])

    const storage = new Uint8Array([91, 4, 5, 6, 92])
    const subarray = storage.subarray(1, 4)
    const normalizedSubarray = normalizeDownloadedPluginBytes(subarray)
    expect(Array.from(new Uint8Array(normalizedSubarray))).toEqual([4, 5, 6])

    const nodeStorage = Buffer.from([93, 7, 8, 9, 94])
    const nodeView = nodeStorage.subarray(1, 4)
    const normalizedNodeView = normalizeDownloadedPluginBytes(nodeView)
    expect(Array.from(new Uint8Array(normalizedNodeView))).toEqual([7, 8, 9])

    storage[2] = 99
    nodeStorage[2] = 99
    expect(Array.from(new Uint8Array(normalizedSubarray))).toEqual([4, 5, 6])
    expect(Array.from(new Uint8Array(normalizedNodeView))).toEqual([7, 8, 9])
  })

  it('选中历史版本后按该版本下载并在映射中保留真实版本', async () => {
    const expectedHash = sha256('a')
    const download = vi.fn().mockResolvedValue(new TextEncoder().encode('println(1)'))
    const savePlugin = vi.fn().mockResolvedValue({ Id: 17, ScriptName: 'scanner' })
    const saveMapping = vi.fn().mockResolvedValue(undefined)

    const result = await installTeamPluginDownload(
      {
        id: 5,
        scriptName: 'scanner',
        type: 'yak',
        version: 2,
        fileHash: expectedHash,
        revision: 9,
      },
      {
        download,
        digest: () => Promise.resolve(expectedHash),
        savePlugin,
        saveMapping,
      },
    )

    expect(download).toHaveBeenCalledWith(2)
    expect(result.mapping).toMatchObject({ version: 2, revision: 9, fileHash: expectedHash })
    expect(saveMapping).toHaveBeenCalledWith(expect.objectContaining({ version: 2, revision: 9 }))
  })

  it('版本哈希缺失时所有本地写入均为零', async () => {
    const savePlugin = vi.fn()
    const saveGroups = vi.fn()
    const saveMapping = vi.fn()

    await expect(
      installTeamPluginDownload(
        { id: 5, scriptName: 'scanner', type: 'yak', version: 2, fileHash: '', revision: 9 },
        {
          download: () => Promise.resolve(new TextEncoder().encode('println(1)')),
          digest: () => Promise.resolve(sha256('a')),
          savePlugin,
          saveGroups,
          saveMapping,
        },
      ),
    ).rejects.toThrow('插件版本缺少有效正文摘要')
    expect(savePlugin).not.toHaveBeenCalled()
    expect(saveGroups).not.toHaveBeenCalled()
    expect(saveMapping).not.toHaveBeenCalled()
  })

  it('摘要返回值格式异常时所有本地写入均为零', async () => {
    const savePlugin = vi.fn()
    const saveGroups = vi.fn()
    const saveMapping = vi.fn()

    await expect(
      installTeamPluginDownload(
        {
          id: 5,
          scriptName: 'scanner',
          type: 'yak',
          version: 2,
          fileHash: sha256('b'),
          revision: 9,
        },
        {
          download: () => Promise.resolve(new TextEncoder().encode('println(1)')),
          digest: () => Promise.resolve('not-a-sha256'),
          savePlugin,
          saveGroups,
          saveMapping,
        },
      ),
    ).rejects.toThrow('插件正文摘要格式无效')
    expect(savePlugin).not.toHaveBeenCalled()
    expect(saveGroups).not.toHaveBeenCalled()
    expect(saveMapping).not.toHaveBeenCalled()
  })

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
        fileHash: sha256('c'),
        version: 2,
        revision: 4,
        visibility: 'team',
        categoryId: 3,
        categoryName: '扫描',
        groupIds: [8, 9],
        groupNames: ['扫描', '红队'],
      },
      {
        onlineBaseUrl: 'https://online.example',
        download: () => Promise.resolve(new TextEncoder().encode('println(1)')),
        digest: () => Promise.resolve(sha256('c')),
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
        version: 2,
        revision: 4,
        fileHash: sha256('c'),
      }),
    )
    expect(result.localPlugin).toMatchObject({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' })
  })

  it('摘要不一致时拒绝写入本机插件库', async () => {
    const savePlugin = vi.fn()
    await expect(
      installTeamPluginDownload(
        { id: 5, scriptName: 'scanner', type: 'yak', fileHash: sha256('d'), version: 1, revision: 1 },
        {
          download: () => Promise.resolve(new TextEncoder().encode('changed')),
          digest: () => Promise.resolve(sha256('e')),
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
        { id: 6, scriptName: 'empty', type: 'yak', fileHash: sha256('f'), version: 1, revision: 1 },
        {
          download: () => Promise.resolve(new Uint8Array()),
          digest: () => Promise.resolve(sha256('f')),
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
      { id: 11, scriptName: 'buffer-plugin', type: 'yak', fileHash: sha256('1'), version: 1, revision: 1 },
      {
        download: () => Promise.resolve(content),
        digest: async (bytes) => {
          expect(new TextDecoder().decode(bytes)).toBe('println(4)')
          return sha256('1')
        },
        savePlugin,
      },
    )

    expect(savePlugin).toHaveBeenCalledWith(expect.objectContaining({ Content: 'println(4)' }))
    expect(result.mapping?.localPluginId).toBe(19)
  })

  it('严格解码 UTF-8 并保留 BOM，重编码后的字节和摘要与下载正文一致', async () => {
    const body = new TextEncoder().encode('println(5)')
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...body])
    const expectedHash = digestBytes(bytes)
    const savePlugin = vi.fn().mockResolvedValue({ Id: 20, ScriptName: 'bom-plugin' })
    const saveGroups = vi.fn().mockResolvedValue(undefined)
    const saveMapping = vi.fn().mockResolvedValue(undefined)

    await installTeamPluginDownload(
      {
        id: 12,
        scriptName: 'bom-plugin',
        type: 'yak',
        fileHash: expectedHash,
        version: 1,
        revision: 1,
        categoryName: '带 BOM',
      },
      {
        download: () => Promise.resolve(bytes),
        digest: () => Promise.resolve(expectedHash),
        savePlugin,
        saveGroups,
        saveMapping,
      },
    )

    expect(savePlugin).toHaveBeenCalledTimes(1)
    expect(saveGroups).toHaveBeenCalledTimes(1)
    expect(saveMapping).toHaveBeenCalledTimes(1)
    const savedContent = String(savePlugin.mock.calls[0][0].Content)
    expect(savedContent.startsWith('\uFEFF')).toBe(true)
    const reencoded = new TextEncoder().encode(savedContent)
    expect(Array.from(reencoded)).toEqual(Array.from(bytes))
    expect(digestBytes(reencoded)).toBe(expectedHash)
  })

  it('非法 UTF-8 正文失败关闭且所有本地写入次数均为零', async () => {
    const bytes = new Uint8Array([0xc3, 0x28])
    const expectedHash = digestBytes(bytes)
    const savePlugin = vi.fn().mockResolvedValue({ Id: 21, ScriptName: 'invalid-utf8' })
    const saveGroups = vi.fn().mockResolvedValue(undefined)
    const saveMapping = vi.fn().mockResolvedValue(undefined)
    let failure: unknown

    try {
      await installTeamPluginDownload(
        {
          id: 13,
          scriptName: 'invalid-utf8',
          type: 'yak',
          fileHash: expectedHash,
          version: 1,
          revision: 1,
          categoryName: '非法正文',
        },
        {
          download: () => Promise.resolve(bytes),
          digest: () => Promise.resolve(expectedHash),
          savePlugin,
          saveGroups,
          saveMapping,
        },
      )
    } catch (error) {
      failure = error
    }
    expect(savePlugin).toHaveBeenCalledTimes(0)
    expect(saveGroups).toHaveBeenCalledTimes(0)
    expect(saveMapping).toHaveBeenCalledTimes(0)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('插件正文不是有效 UTF-8')
  })

  it('本地同名插件存在时默认拒绝静默覆盖', async () => {
    const download = vi.fn()
    const savePlugin = vi.fn()

    await expect(
      installTeamPluginDownload(
        { id: 7, scriptName: 'scanner', type: 'yak', fileHash: sha256('2'), version: 1, revision: 1 },
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
      { id: 8, scriptName: 'scanner', type: 'yak', fileHash: sha256('3'), version: 2, revision: 2 },
      {
        findLocalPlugin: async (scriptName) =>
          scriptName === 'scanner' ? { Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' } : undefined,
        resolveLocalConflict: async () => ({ action: 'copy', scriptName: 'scanner-copy' }),
        download: () => Promise.resolve(new TextEncoder().encode('println(2)')),
        digest: () => Promise.resolve(sha256('3')),
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
      {
        id: 10,
        scriptName: 'scanner',
        type: 'yak',
        uuid: 'remote-uuid',
        fileHash: sha256('4'),
        version: 5,
        revision: 5,
      },
      {
        findLocalPlugin: async () => ({ Id: 17, ScriptName: 'scanner', UUID: 'local-uuid' }),
        resolveLocalConflict: async () => ({ action: 'overwrite' }),
        download: () => Promise.resolve(new TextEncoder().encode('println(3)')),
        digest: () => Promise.resolve(sha256('4')),
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
      { id: 9, scriptName: 'scanner', type: 'yak', fileHash: sha256('5'), version: 3, revision: 3 },
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
