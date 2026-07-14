import { describe, expect, it } from 'vitest'
import { normalizeHttpBaseUrl, normalizeHttpUrl } from '../security'

describe('security http url validation', () => {
  it('accepts HTTP and HTTPS addresses', () => {
    expect(normalizeHttpUrl('http://service.example/admin')).toBe('http://service.example/admin')
    expect(normalizeHttpUrl('https://service.example/admin#section')).toBe('https://service.example/admin')
  })

  it.each(['file:///tmp/admin', 'javascript:alert(1)', 'data:text/plain,test', 'shell:open'])(
    'rejects unsupported protocol %s',
    (value) => {
      expect(() => normalizeHttpUrl(value)).toThrow('only http/https urls are allowed')
    },
  )

  it('normalizes a service root without preserving a fragment or trailing slash', () => {
    expect(normalizeHttpBaseUrl('https://service.example/root/#section')).toBe('https://service.example/root')
  })
})
