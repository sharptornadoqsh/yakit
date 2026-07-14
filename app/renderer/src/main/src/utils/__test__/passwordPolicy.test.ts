import { describe, expect, it } from 'vitest'
import { isStrongPassword } from '../passwordPolicy'

describe('isStrongPassword', () => {
  it.each(['Aa1!aaaa', `Aa1!${'a'.repeat(16)}`])('accepts a compliant password', (value) => {
    expect(isStrongPassword(value)).toBe(true)
  })

  it.each([
    'Aa1!aaa',
    `Aa1!${'a'.repeat(17)}`,
    'aa1!aaaa',
    'AA1!AAAA',
    'Aaa!aaaa',
    'Aa11aaaa',
    'Aa1!aaaa ',
    'Aa1!aaaa中文',
    '',
  ])('rejects a password outside the policy', (value) => {
    expect(isStrongPassword(value)).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isStrongPassword(undefined)).toBe(false)
  })
})
