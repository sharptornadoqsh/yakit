import { describe, expect, it } from 'vitest'
import { buildCompareSummary, formatCompareBytes } from '../compareMetrics'

describe('报文差异统计', () => {
  it('按 UTF-8 输出真实字节视图', () => {
    expect(formatCompareBytes('A你')).toBe('00000000  41 e4 bd a0                                      |A...|')
    expect(formatCompareBytes('')).toBe('')
  })

  it('分别统计字符差异与字节差异', () => {
    expect(buildCompareSummary('A你', 'A好', 'text')).toEqual({
      leftLength: 2,
      rightLength: 2,
      differenceCount: 1,
      unit: '字符',
    })
    expect(buildCompareSummary('A你', 'A好', 'bytes')).toEqual({
      leftLength: 4,
      rightLength: 4,
      differenceCount: 3,
      unit: '字节',
    })
  })
})
