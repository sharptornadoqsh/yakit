export type CompareMode = 'text' | 'bytes'

export interface CompareSummary {
  leftLength: number
  rightLength: number
  differenceCount: number
  unit: '字符' | '字节'
}

const encode = (value: string) => Array.from(new TextEncoder().encode(value))

export const formatCompareBytes = (value: string) => {
  const bytes = encode(value)
  const rows: string[] = []

  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.slice(offset, offset + 16)
    const address = offset.toString(16).padStart(8, '0')
    const hexadecimal = row
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ')
    const printable = row.map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('')
    rows.push(`${address}  ${hexadecimal}  |${printable}|`)
  }

  return rows.join('\n')
}

export const buildCompareSummary = (left: string, right: string, mode: CompareMode): CompareSummary => {
  const leftUnits = mode === 'bytes' ? encode(left) : Array.from(left)
  const rightUnits = mode === 'bytes' ? encode(right) : Array.from(right)
  const length = Math.max(leftUnits.length, rightUnits.length)
  let differenceCount = 0

  for (let index = 0; index < length; index += 1) {
    if (leftUnits[index] !== rightUnits[index]) differenceCount += 1
  }

  return {
    leftLength: leftUnits.length,
    rightLength: rightUnits.length,
    differenceCount,
    unit: mode === 'bytes' ? '字节' : '字符',
  }
}
