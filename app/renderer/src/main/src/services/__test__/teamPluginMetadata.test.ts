import {
  normalizePluginDistributionFields,
  requirePluginVersion,
  validateTeamPluginVersion,
} from '../teamPluginMetadata'

const record = {
  id: 9,
  team_id: 3,
  plugin_id: 5,
  version: 2,
  file_hash: 'a'.repeat(64),
  change_note: '',
  created_by: 7,
  created_at: '',
}

describe('团队插件分发字段契约', () => {
  it('在边界统一数字字符串，不修改输入或摘要', () => {
    const input = { ...record, team_id: '3', plugin_id: '5', version: '2' }
    expect(validateTeamPluginVersion(input as any, 3, 5)).toEqual(record)
    expect(input.version).toBe('2')
    expect(normalizePluginDistributionFields({ version: '2', size_bytes: '10' })).toEqual({
      version: 2,
      size_bytes: 10,
    })
  })
  it.each([0, '0', '', null, undefined, -1, 1.5, true, '1e2', Number.MAX_SAFE_INTEGER + 1])(
    '拒绝非法 version=%s',
    (version) => {
      expect(() => requirePluginVersion(version)).toThrow(/version/)
    },
  )
  it('零版本明确要求服务端迁移，不生成版本一', () => {
    expect(() => requirePluginVersion(0)).toThrow(/旧上传记录.*服务端.*迁移/)
  })
  it.each([
    ['team_id', 4],
    ['plugin_id', 6],
    ['file_hash', 'broken'],
  ])('报告具体错误字段 %s', (field, value) => {
    expect(() => validateTeamPluginVersion({ ...record, [field]: value }, 3, 5)).toThrow(field)
  })
})
