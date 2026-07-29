const childProcess = require('child_process')

const SPECIAL_DETECTION_ACTIVATION_TIMEOUT_MS = 60_000
const SPECIAL_DETECTION_ACTIVATION_OUTPUT_LIMIT = 64 * 1024

const createActivationError = (code, message, details = {}) => {
  const error = new Error(message)
  error.code = code
  Object.assign(error, details)
  return error
}

const appendLimitedOutput = (current, data, limit) => {
  const available = Math.max(0, limit - Buffer.byteLength(current))
  const incoming = Buffer.isBuffer(data) ? data : Buffer.from(String(data))
  if (available === 0) return { value: current, truncated: incoming.length > 0 }
  const accepted = incoming.subarray(0, available)
  return {
    value: current + accepted.toString('utf8'),
    truncated: accepted.length < incoming.length,
  }
}

const runSpecialDetectionActivation = ({
  command,
  args = ['help'],
  env,
  timeoutMs = SPECIAL_DETECTION_ACTIVATION_TIMEOUT_MS,
  outputLimit = SPECIAL_DETECTION_ACTIVATION_OUTPUT_LIMIT,
  spawnProcess = childProcess.spawn,
}) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now()
    let subprocess
    let settled = false
    let stdout = ''
    let stderr = ''
    let outputTruncated = false

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      callback(value)
    }

    let timeoutId
    try {
      subprocess = spawnProcess(command, args, {
        env,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(
        createActivationError(
          'SPECIAL_DETECTION_ACTIVATION_START_FAILED',
          `专项检测插件激活进程启动失败：${error.message || error}`,
          { cause: error },
        ),
      )
      return
    }

    timeoutId = setTimeout(() => {
      try {
        subprocess.kill()
      } catch (error) {}
      finish(
        reject,
        createActivationError('SPECIAL_DETECTION_ACTIVATION_TIMEOUT', `专项检测插件激活超过 ${timeoutMs} 毫秒`, {
          pid: subprocess.pid,
          timeoutMs,
        }),
      )
    }, timeoutMs)

    subprocess.stdout?.on('data', (data) => {
      const result = appendLimitedOutput(stdout, data, outputLimit)
      stdout = result.value
      outputTruncated = outputTruncated || result.truncated
    })
    subprocess.stderr?.on('data', (data) => {
      const result = appendLimitedOutput(stderr, data, outputLimit)
      stderr = result.value
      outputTruncated = outputTruncated || result.truncated
    })
    subprocess.once('error', (error) => {
      finish(
        reject,
        createActivationError(
          'SPECIAL_DETECTION_ACTIVATION_START_FAILED',
          `专项检测插件激活进程启动失败：${error.message || error}`,
          { cause: error, pid: subprocess.pid },
        ),
      )
    })
    subprocess.once('close', (exitCode, signal) => {
      const result = {
        pid: subprocess.pid,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        outputTruncated,
      }
      if (exitCode === 0) {
        finish(resolve, result)
        return
      }
      finish(
        reject,
        createActivationError(
          'SPECIAL_DETECTION_ACTIVATION_FAILED',
          `专项检测插件激活进程退出异常：${exitCode ?? signal ?? 'unknown'}`,
          result,
        ),
      )
    })
  })

module.exports = {
  SPECIAL_DETECTION_ACTIVATION_OUTPUT_LIMIT,
  SPECIAL_DETECTION_ACTIVATION_TIMEOUT_MS,
  runSpecialDetectionActivation,
}
