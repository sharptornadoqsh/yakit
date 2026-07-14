import { describe, expect, it } from 'vitest'
import { RENYAN_STATE_TRANSLATION_KEYS } from '../stateConfig'

describe('RENYAN_STATE_TRANSLATION_KEYS', () => {
  it('defines every unified shell state', () => {
    expect(Object.keys(RENYAN_STATE_TRANSLATION_KEYS)).toEqual(['empty', 'loading', 'error', 'noPermission', 'offline'])
  })

  it('uses distinct translation keys for every state', () => {
    const keys = Object.values(RENYAN_STATE_TRANSLATION_KEYS).flatMap((item) => [item.title, item.description])
    expect(new Set(keys).size).toBe(keys.length)
  })
})
