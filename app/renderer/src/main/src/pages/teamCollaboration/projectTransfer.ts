import { randomString } from '@/utils/randomUtil'

export interface ProjectTransferIpc {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  on: (channel: string, listener: (...args: any[]) => void) => ProjectTransferIpc
  removeListener: (channel: string, listener: (...args: any[]) => void) => ProjectTransferIpc
}

interface ProjectTransferProgress {
  TargetPath?: string
  Percent?: number
  Verbose?: string
}

interface RunProjectTransferInput {
  channel: 'ExportProject' | 'ImportProject'
  params: Record<string, unknown>
  token?: string
  requireTargetPath?: boolean
  onProgress?: (progress: ProjectTransferProgress) => void
  signal?: AbortSignal
  timeoutMs?: number
}

const readErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as { details?: unknown; message?: unknown }
    if (typeof value.details === 'string') return value.details
    if (typeof value.message === 'string') return value.message
  }
  return String(error || '项目传输失败')
}

export const runProjectTransfer = (ipc: ProjectTransferIpc, input: RunProjectTransferInput): Promise<string> => {
  return new Promise((resolve, reject) => {
    const token = input.token || `team-project-${Date.now()}-${randomString(20)}`
    const dataChannel = `${token}-data`
    const errorChannel = `${token}-error`
    const endChannel = `${token}-end`
    let targetPath = ''
    let settled = false
    let started = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      clearTimeout(timeout)
      input.signal?.removeEventListener('abort', onAbort)
      ipc.removeListener(dataChannel, onData)
      ipc.removeListener(errorChannel, onError)
      ipc.removeListener(endChannel, onEnd)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      if (started) {
        try {
          Promise.resolve(ipc.invoke(`cancel-${input.channel}`, token)).catch(() => undefined)
        } catch {}
      }
      reject(error instanceof Error ? error : new Error(readErrorMessage(error)))
    }
    const onAbort = () => {
      const error = new Error('项目传输已取消')
      error.name = 'AbortError'
      fail(error)
    }
    const onData = (_event: unknown, progress: ProjectTransferProgress = {}) => {
      if (settled) return
      if (progress.TargetPath) targetPath = progress.TargetPath
      try {
        input.onProgress?.(progress)
      } catch (error) {
        fail(error)
      }
    }
    const onError = (_event: unknown, error: unknown) => fail(error)
    const onEnd = () => {
      if (settled) return
      if (input.requireTargetPath && !targetPath) {
        fail('项目导出结束但未返回归档路径')
        return
      }
      settled = true
      cleanup()
      resolve(targetPath)
    }
    if (input.signal?.aborted) {
      onAbort()
      return
    }
    timeout = setTimeout(() => fail('项目传输超时，请重试'), input.timeoutMs ?? 30 * 60 * 1000)
    input.signal?.addEventListener('abort', onAbort, { once: true })

    ipc.on(dataChannel, onData)
    ipc.on(errorChannel, onError)
    ipc.on(endChannel, onEnd)
    try {
      started = true
      Promise.resolve(ipc.invoke(input.channel, input.params, token)).catch(fail)
    } catch (error) {
      fail(error)
    }
  })
}
