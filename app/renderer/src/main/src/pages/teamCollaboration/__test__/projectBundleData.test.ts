import {
  PROJECT_BUNDLE_DATA_TYPE,
  PROJECT_BUNDLE_SCHEMA,
  buildProjectBundleChunkInput,
  buildProjectBundleManifest,
  getProjectBundleManifest,
  orderProjectBundleChunks,
  parseProjectBundleChunk,
  setProjectBundleManifest,
} from '../projectBundleData'

describe('团队项目归档协议', () => {
  const manifest = buildProjectBundleManifest({
    bundleId: 'bundle-20260723',
    fileName: 'baseline.yakitproject',
    fileSize: 17,
    sha256: 'a'.repeat(64),
    chunkSize: 8,
    chunkCount: 3,
    localProjectId: 51,
    localProjectName: '本地基线',
    createdAt: '2026-07-23T03:00:00.000Z',
  })

  it('在保留既有快照字段的同时写入归档清单', () => {
    const snapshot = setProjectBundleManifest({ dashboard: { revision: 9 }, owner: 'team' }, manifest)

    expect(snapshot.dashboard).toEqual({ revision: 9 })
    expect(snapshot.owner).toBe('team')
    expect(getProjectBundleManifest(snapshot)).toEqual(manifest)
  })

  it('生成可跨项目复制定位的分块记录', () => {
    expect(buildProjectBundleChunkInput(manifest, 1, 'cHJvamVjdA==')).toEqual({
      name: 'baseline.yakitproject [2/3]',
      type: PROJECT_BUNDLE_DATA_TYPE,
      metadata: {
        schema: PROJECT_BUNDLE_SCHEMA,
        bundle_id: 'bundle-20260723',
        index: 1,
        total: 3,
      },
      deduplication_key: 'project-bundle:bundle-20260723:1',
      status: 'ready',
      content: JSON.stringify({
        schema: PROJECT_BUNDLE_SCHEMA,
        bundle_id: 'bundle-20260723',
        index: 1,
        total: 3,
        data: 'cHJvamVjdA==',
      }),
    })
  })

  it('依据清单元数据排序复制后标识已变化的分块', () => {
    const records = [
      {
        id: 903,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 2, total: 3 }),
      },
      {
        id: 901,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 0, total: 3 }),
      },
      {
        id: 902,
        metadata: JSON.stringify({ schema: PROJECT_BUNDLE_SCHEMA, bundle_id: manifest.bundle_id, index: 1, total: 3 }),
      },
    ]

    expect(orderProjectBundleChunks(records, manifest).map((item) => item.id)).toEqual([901, 902, 903])
  })

  it('拒绝缺失分块及内容描述不一致的归档', () => {
    expect(() =>
      orderProjectBundleChunks(
        [
          {
            id: 1,
            metadata: JSON.stringify({
              schema: PROJECT_BUNDLE_SCHEMA,
              bundle_id: manifest.bundle_id,
              index: 0,
              total: 3,
            }),
          },
        ],
        manifest,
      ),
    ).toThrow('项目归档分块数量不完整')

    expect(() =>
      parseProjectBundleChunk(
        {
          schema: PROJECT_BUNDLE_SCHEMA,
          bundle_id: manifest.bundle_id,
          index: 2,
          total: 3,
          data: 'YQ==',
        },
        manifest,
        1,
      ),
    ).toThrow('项目归档分块序号不匹配')
  })
})
