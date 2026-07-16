import { describe, expect, it, vi } from 'vitest'
import { shouldWarnAboutRemoteHttpUrl } from '../tool'

vi.mock('../logCollection', () => ({ debugToPrintLogs: vi.fn() }))

describe('远程 HTTP 地址提示判断', () => {
  it.each([
    ['http://127.0.0.1:3001', false],
    ['http://127.8.9.10:3001', false],
    ['http://localhost:3001', false],
    ['http://[::1]:3001', false],
    ['http://192.168.1.8:3001', true],
    ['http://service.example.com', true],
    ['https://service.example.com', false],
    ['service.example.com', false],
  ])('地址 %s 的提示状态为 %s', (value, expected) => {
    expect(shouldWarnAboutRemoteHttpUrl(value)).toBe(expected)
  })
})
