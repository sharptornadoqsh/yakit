import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSpecialDetectionActivation } from '../specialDetectionActivation'

const createSubprocess = () => {
  const subprocess = new EventEmitter()
  subprocess.pid = 24001
  subprocess.stdout = new PassThrough()
  subprocess.stderr = new PassThrough()
  subprocess.kill = vi.fn(() => true)
  return subprocess
}

describe('专项检测运行时激活', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('等待一次性引擎进程成功退出并返回受限输出', async () => {
    const subprocess = createSubprocess()
    const spawnProcess = vi.fn(() => subprocess)
    const activation = runSpecialDetectionActivation({
      command: 'yak.exe',
      env: { YAKIT_HOME: 'C:\\RuiYan' },
      outputLimit: 8,
      spawnProcess,
    })

    subprocess.stdout.write('1234567890')
    subprocess.stderr.write('warning')
    subprocess.emit('close', 0, null)

    await expect(activation).resolves.toMatchObject({
      pid: 24001,
      exitCode: 0,
      stdout: '12345678',
      stderr: 'warning',
      outputTruncated: true,
    })
    expect(spawnProcess).toHaveBeenCalledWith('yak.exe', ['help'], {
      env: { YAKIT_HOME: 'C:\\RuiYan' },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  })

  it('拒绝一次性引擎进程的非零退出', async () => {
    const subprocess = createSubprocess()
    const activation = runSpecialDetectionActivation({
      command: 'yak.exe',
      env: {},
      spawnProcess: () => subprocess,
    })

    subprocess.stderr.write('database initialization failed')
    subprocess.emit('close', 2, null)

    await expect(activation).rejects.toMatchObject({
      code: 'SPECIAL_DETECTION_ACTIVATION_FAILED',
      exitCode: 2,
    })
  })

  it('启动错误保留可识别错误码', async () => {
    const subprocess = createSubprocess()
    const activation = runSpecialDetectionActivation({
      command: 'yak.exe',
      env: {},
      spawnProcess: () => subprocess,
    })

    subprocess.emit('error', new Error('spawn failed'))

    await expect(activation).rejects.toMatchObject({
      code: 'SPECIAL_DETECTION_ACTIVATION_START_FAILED',
    })
  })

  it('超过时限后终止一次性引擎进程', async () => {
    vi.useFakeTimers()
    const subprocess = createSubprocess()
    const activation = runSpecialDetectionActivation({
      command: 'yak.exe',
      env: {},
      timeoutMs: 1000,
      spawnProcess: () => subprocess,
    })
    const rejection = expect(activation).rejects.toMatchObject({
      code: 'SPECIAL_DETECTION_ACTIVATION_TIMEOUT',
    })

    await vi.advanceTimersByTimeAsync(1000)

    await rejection
    expect(subprocess.kill).toHaveBeenCalledTimes(1)
  })
})
