import { buildTeamPluginQuery, summarizeTeamPluginImportResults } from '../teamPluginData'

describe('团队插件列表数据转换', () => {
  it('查询保留搜索、分类、分组与可见范围', () => {
    expect(
      buildTeamPluginQuery({
        keyword: 'http',
        categoryId: 4,
        groupId: 9,
        visibility: 'team',
        page: 2,
        limit: 20,
      }),
    ).toEqual({ keyword: 'http', category_id: 4, group_id: 9, visibility: 'team', page: 2, limit: 20 })
  })

  it('批量导入保留每项状态与原因', () => {
    expect(
      summarizeTeamPluginImportResults([
        {
          name: 'plugin-a',
          source_name: 'plugin-a.yak',
          plugin_name: 'plugin-a',
          status: 'created',
          message: '插件已创建',
          remote_plugin_id: 11,
          version: 1,
          content_hash: 'hash-a',
          conflict_type: '',
        },
        {
          name: 'plugin-b',
          source_name: 'plugin-b.yak',
          plugin_name: 'plugin-b',
          status: 'failed',
          message: '修订冲突',
          conflict_type: 'version',
        },
        {
          name: 'plugin-c',
          source_name: 'plugin-c.yak',
          plugin_name: 'plugin-c',
          status: 'skipped',
          message: '已存在',
          remote_plugin_id: 12,
          version: 2,
          conflict_type: 'name_and_content',
        },
      ]),
    ).toEqual({
      succeeded: 1,
      failed: 1,
      skipped: 1,
      items: [
        { name: 'plugin-a', status: 'created', detail: '插件已创建；远端插件 11；版本 1' },
        { name: 'plugin-b', status: 'failed', detail: '修订冲突；冲突 version' },
        {
          name: 'plugin-c',
          status: 'skipped',
          detail: '已存在；远端插件 12；版本 2；冲突 name_and_content',
        },
      ],
    })
  })
})
