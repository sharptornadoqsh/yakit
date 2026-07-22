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
        { name: 'plugin-a', status: 'created', plugin_id: 11, revision: 1 },
        { name: 'plugin-b', status: 'failed', reason: '修订冲突' },
        { name: 'plugin-c', status: 'skipped', reason: '已存在' },
      ]),
    ).toEqual({
      succeeded: 1,
      failed: 1,
      skipped: 1,
      items: [
        { name: 'plugin-a', status: 'created', detail: '插件 11，修订 1' },
        { name: 'plugin-b', status: 'failed', detail: '修订冲突' },
        { name: 'plugin-c', status: 'skipped', detail: '已存在' },
      ],
    })
  })
})
