import { buildProjectShareCreateRequest, getProjectSharePreviewItems } from '../projectShareData'

describe('项目密令数据转换', () => {
  it('创建请求仅使用团队项目标识', () => {
    const result = buildProjectShareCreateRequest(
      { id: 73, name: '团队基线项目' },
      {
        name: '交付密令',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        maxUses: 5,
        enabled: true,
      },
    )

    expect(result).toEqual({
      projectId: 73,
      payload: {
        name: '交付密令',
        expires_at: '2026-08-01T00:00:00.000Z',
        max_uses: 5,
        enabled: true,
      },
    })
  })

  it('预览完整展示项目、创建人、团队、时间、有效期与摘要', () => {
    expect(
      getProjectSharePreviewItems({
        project_name: '攻防演练',
        creator_name: '张三',
        team_name: '红队',
        created_at: '2026-07-22T08:00:00Z',
        expires_at: '2026-07-29T08:00:00Z',
        summary: '包含测试数据与结果',
      }),
    ).toEqual([
      ['项目名', '攻防演练'],
      ['创建人', '张三'],
      ['团队', '红队'],
      ['创建时间', '2026-07-22T08:00:00Z'],
      ['有效期至', '2026-07-29T08:00:00Z'],
      ['内容摘要', '包含测试数据与结果'],
    ])
  })
})
