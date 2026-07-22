import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveApplicationDownloadPath } from '../applicationArtifact'

describe('睿眼安装文件路径', () => {
  it('将普通更新与内网安装包统一为睿眼文件名', () => {
    const destination = resolveApplicationDownloadPath('C:\\Downloads', 'https://example.invalid/yakit-v1.4.2.zip')

    expect(path.basename(destination)).toBe('RuiYan-Pentest-v1.4.2.zip')
    expect(destination).not.toMatch(/yakit/i)
  })

  it('处理不带版本后缀的源文件名', () => {
    expect(path.basename(resolveApplicationDownloadPath('C:\\Downloads', 'yakit.zip'))).toBe('RuiYan-Pentest.zip')
  })

  it('特殊产品保留原始文件名', () => {
    expect(
      path.basename(
        resolveApplicationDownloadPath('C:\\Downloads', 'https://example.invalid/IRify-v1.4.2.zip', {
          preserveFilename: true,
        }),
      ),
    ).toBe('IRify-v1.4.2.zip')
  })
})
