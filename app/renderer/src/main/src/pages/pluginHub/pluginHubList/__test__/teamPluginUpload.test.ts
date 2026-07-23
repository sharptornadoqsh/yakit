import { vi } from 'vitest'
import { buildTeamPluginUploadEntries } from '../teamPluginUpload'

describe('本地插件上传到团队仓库', () => {
  it('读取真实正文并生成摘要、分类和分组参数', async () => {
    const digest = vi.fn(async (content: string) => `hash:${content}`)

    const entries = await buildTeamPluginUploadEntries(
      [
        {
          Id: 7,
          ScriptName: '端口检查',
          Type: 'yak',
          Content: 'println(1)',
          Help: '检查端口',
          Tags: '网络, 端口,网络',
        },
      ],
      { visibility: 'team', categoryId: 3, groupIds: [8, 8, 9], overwrite: true },
      digest,
    )

    expect(digest).toHaveBeenCalledWith('println(1)')
    expect(entries).toEqual([
      {
        source_name: '端口检查',
        script_name: '端口检查',
        type: 'yak',
        content: 'println(1)',
        tags: ['网络', '端口'],
        description: '检查端口',
        visibility: 'team',
        category_id: 3,
        group_ids: [8, 9],
        overwrite: true,
        file_hash: 'hash:println(1)',
      },
    ])
  })

  it('拒绝正文为空的本地插件', async () => {
    await expect(
      buildTeamPluginUploadEntries(
        [{ Id: 8, ScriptName: '空插件', Type: 'yak', Content: '  ' }],
        { visibility: 'private' },
        async () => 'unused',
      ),
    ).rejects.toThrow('空插件')
  })

  it('拒绝空选择', async () => {
    await expect(buildTeamPluginUploadEntries([], { visibility: 'team' }, async () => 'unused')).rejects.toThrow(
      '请选择本地插件',
    )
  })
})
