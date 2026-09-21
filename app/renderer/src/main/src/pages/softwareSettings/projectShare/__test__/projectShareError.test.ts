import { getProjectShareErrorCode } from '../projectShareBundle'

describe('Electron 错误序列化后的恢复状态', () => {
  it('从 invoke 错误的标准前缀恢复不确定结果码', () => {
    expect(
      getProjectShareErrorCode(
        new Error(
          "Error invoking remote method 'ImportProjectShareArchive': Error: local_import_outcome_unknown: 引擎断开",
        ),
      ),
    ).toBe('local_import_outcome_unknown')
  })
  it('结构化错误优先，普通消息中出现代码名称不改变错误类别', () => {
    expect(
      getProjectShareErrorCode({ code: 'local_project_name_conflict', message: 'local_import_outcome_unknown' }),
    ).toBe('local_project_name_conflict')
    expect(getProjectShareErrorCode(new Error('日志提到了 local_import_outcome_unknown'))).toBe('')
  })
})
