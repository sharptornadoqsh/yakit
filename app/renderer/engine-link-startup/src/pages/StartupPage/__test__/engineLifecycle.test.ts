import { describe, expect, it } from 'vitest'
import {
  ENGINE_LIFECYCLE_STATES,
  assessEngineCompatibility,
  decideEngineStartup,
  engineLifecycleReducer,
  initialEngineLifecycleState,
} from '../engineLifecycle'

describe('引擎生命周期状态模型', () => {
  it('包含阶段三要求的全部状态', () => {
    expect(ENGINE_LIFECYCLE_STATES).toEqual([
      'checking-local',
      'ready-local',
      'extracting-bundled',
      'missing',
      'incompatible',
      'update-available',
      'downloading',
      'verifying',
      'installing',
      'starting',
      'connected',
      'remote',
      'error',
      'recoverable-error',
    ])
  })

  it('更新状态时保留真实进度与诊断信息', () => {
    const next = engineLifecycleReducer(initialEngineLifecycleState, {
      type: 'transition',
      state: 'downloading',
      message: '正在下载引擎',
      progress: 42,
      logPath: 'C:\\logs\\engine.log',
    })

    expect(next).toEqual({
      state: 'downloading',
      message: '正在下载引擎',
      progress: 42,
      logPath: 'C:\\logs\\engine.log',
      error: undefined,
    })
  })
})

describe('引擎启动决策', () => {
  it('远程模式优先于本地文件与预置工件', () => {
    expect(
      decideEngineStartup({
        mode: 'remote',
        local: { exists: true, compatibility: 'compatible', updateAvailable: false },
        bundled: { exists: true },
      }),
    ).toEqual({ state: 'remote', action: 'connect-remote' })
  })

  it('兼容的已安装引擎在断网条件直接启动', () => {
    expect(
      decideEngineStartup({
        mode: 'local',
        local: { exists: true, compatibility: 'compatible', updateAvailable: false },
        bundled: { exists: false },
      }),
    ).toEqual({ state: 'ready-local', action: 'start-local' })
  })

  it('版本能力尚未确认时启动本地引擎并执行本地能力检查', () => {
    expect(
      decideEngineStartup({
        mode: 'local',
        local: { exists: true, compatibility: 'unknown', updateAvailable: false },
        bundled: { exists: true },
      }),
    ).toEqual({ state: 'checking-local', action: 'start-local' })
  })

  it('兼容旧版本直接启动并在主界面提示更新', () => {
    expect(
      decideEngineStartup({
        mode: 'local',
        local: { exists: true, compatibility: 'compatible', updateAvailable: true },
        bundled: { exists: true },
      }),
    ).toEqual({ state: 'update-available', action: 'start-local', backgroundUpdate: true })
  })

  it('没有兼容本地引擎时使用预置工件', () => {
    expect(
      decideEngineStartup({
        mode: 'local',
        local: { exists: false, compatibility: 'unknown', updateAvailable: false },
        bundled: { exists: true },
      }),
    ).toEqual({ state: 'extracting-bundled', action: 'extract-bundled' })
  })

  it('不兼容且没有预置工件时阻断启动', () => {
    expect(
      decideEngineStartup({
        mode: 'local',
        local: { exists: true, compatibility: 'incompatible', updateAvailable: false },
        bundled: { exists: false },
      }),
    ).toEqual({ state: 'incompatible', action: 'show-recovery' })
  })

  it('本地与预置均缺失时等待用户选择', () => {
    expect(
      decideEngineStartup({
        mode: 'local',
        local: { exists: false, compatibility: 'unknown', updateAvailable: false },
        bundled: { exists: false },
      }),
    ).toEqual({ state: 'missing', action: 'await-user' })
  })
})

describe('引擎兼容判断', () => {
  it('以运行能力检查作为首要兼容条件', () => {
    expect(
      assessEngineCompatibility({
        currentVersion: '1.4.8-beta3',
        capability: 'incompatible',
        minimumVersion: undefined,
        recommendedVersion: '1.4.8-beta3',
        highestVerifiedVersion: '1.4.8-beta3',
      }),
    ).toEqual({ compatibility: 'incompatible', updateAvailable: false, reason: 'capability-check-failed' })
  })

  it('低于已知最低版本时阻断启动', () => {
    expect(
      assessEngineCompatibility({
        currentVersion: '1.4.7-beta2',
        capability: 'compatible',
        minimumVersion: '1.4.8-beta1',
        recommendedVersion: '1.4.8-beta3',
        highestVerifiedVersion: '1.4.8-beta3',
      }),
    ).toEqual({ compatibility: 'incompatible', updateAvailable: true, reason: 'below-minimum' })
  })

  it('兼容旧版本允许启动并标记推荐更新', () => {
    expect(
      assessEngineCompatibility({
        currentVersion: '1.4.8-beta2',
        capability: 'compatible',
        minimumVersion: '1.4.8-beta1',
        recommendedVersion: '1.4.8-beta3',
        highestVerifiedVersion: '1.4.8-beta3',
      }),
    ).toEqual({ compatibility: 'compatible', updateAvailable: true })
  })

  it('高于最高已验证版本时保留运行能力结论并给出提示', () => {
    expect(
      assessEngineCompatibility({
        currentVersion: '1.4.9-beta1',
        capability: 'compatible',
        minimumVersion: '1.4.8-beta1',
        recommendedVersion: '1.4.8-beta3',
        highestVerifiedVersion: '1.4.8-beta3',
      }),
    ).toEqual({ compatibility: 'compatible', updateAvailable: false, reason: 'above-verified-range' })
  })
})
