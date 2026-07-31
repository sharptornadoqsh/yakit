import { buildProjectShareCreateRequest, getProjectSharePreviewItems } from '../projectShareData'

describe('项目密令数据转换', () => {
  it('创建请求绑定已经 ready 的不可变 bundle', () => {
    const result = buildProjectShareCreateRequest('55555555-5555-4555-8555-555555555555', {
      name: '交付密令',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      maxUses: 5,
      enabled: true,
    })

    expect(result).toEqual({
      bundle_id: '55555555-5555-4555-8555-555555555555',
      name: '交付密令',
      expires_at: '2026-08-01T00:00:00.000Z',
      max_uses: 5,
      enabled: true,
    })
  })

  it('预览只展示不可变快照中的项目、数据、结果、插件和归档摘要', () => {
    expect(
      getProjectSharePreviewItems({
        share_id: 1,
        snapshot_id: 3,
        project_name: '攻防演练',
        data_count: 12,
        result_count: 8,
        plugin_count: 2,
        archive_size: 1_572_864,
        archive_sha256: 'a'.repeat(64),
        media_type: 'application/vnd.yakit.team-project-bundle.v2+zip',
      }),
    ).toEqual([
      ['项目名', '攻防演练'],
      ['测试数据', '12 项'],
      ['测试结果', '8 项'],
      ['项目插件', '2 个'],
      ['归档大小', '1.5 MiB'],
      ['归档摘要', 'a'.repeat(64)],
    ])
  })
})
