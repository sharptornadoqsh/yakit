import React, { useEffect, useRef, useState } from 'react'
import { YakitStatusType, YaklangEngineWatchDogCredential } from '../../types'
import { useDebounceEffect, useMemoizedFn } from 'ahooks'
import { debugToPrintLog } from '@/utils/logCollection'
import { yakitNotify } from '@/utils/notification'
import { __PLATFORM__, FetchSoftwareVersion, isEnpriTraceAgent } from '@/utils/envfile'
import emiter from '@/utils/eventBus/eventBus'
import { grpcStartLocalEngine, isEngineConnectionAlive } from '../../grpc'
import { outputToWelcomeConsole } from '../../utils'
import { yakitEngine } from '@/utils/electronBridge'

export interface YaklangEngineWatchDogProps {
  credential: YaklangEngineWatchDogCredential
  keepalive: boolean
  engineLink: boolean
  onReady?: () => void
  onFailed?: (failedCount: number) => void
  onKeepaliveShouldChange?: (keepalive: boolean) => void
  onLocalEngineStarted?: (port: number, requested: YaklangEngineWatchDogCredential) => boolean | Promise<boolean>
  yakitStatus: YakitStatusType
  setYakitStatus: (v: YakitStatusType) => void
  setCheckLog: (log: string[]) => void
}

export const YaklangEngineWatchDog: React.FC<YaklangEngineWatchDogProps> = React.memo((props) => {
  const latestProps = useRef(props)
  latestProps.current = props
  const mountedRef = useRef(true)
  const latestStartCallIdRef = useRef(0)
  const startingUp = useRef(false)
  const [startRequest, setStartRequest] = useState<{
    id: number
    credential: YaklangEngineWatchDogCredential
  } | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      latestStartCallIdRef.current++
    }
  }, [])

  useEffect(() => {
    if (props.yakitStatus === 'break' || props.credential.Mode !== 'local') {
      latestStartCallIdRef.current++
      startingUp.current = false
      setStartRequest(null)
    }
  }, [props.yakitStatus, props.credential.Mode])

  const isCurrent = (id: number, requested: YaklangEngineWatchDogCredential, actualPort = requested.Port) => {
    const current = latestProps.current
    const credential = current.credential
    return (
      mountedRef.current &&
      id === latestStartCallIdRef.current &&
      current.yakitStatus !== 'break' &&
      credential.Mode === requested.Mode &&
      credential.Host === requested.Host &&
      credential.Password === requested.Password &&
      credential.IsTLS === requested.IsTLS &&
      credential.PemBytes === requested.PemBytes &&
      (credential.Port === requested.Port || credential.Port === actualPort)
    )
  }

  const engineTest = useMemoizedFn(async () => {
    const credential = { ...props.credential }
    if (!credential.Mode || credential.Port <= 0 || props.yakitStatus === 'break') return
    const id = ++latestStartCallIdRef.current
    startingUp.current = false
    setStartRequest(null)
    outputToWelcomeConsole('开始尝试连接 RuiYan Engine')
    try {
      await yakitEngine.connectYaklangEngine(credential)
      if (!isCurrent(id, credential)) return
      props.onKeepaliveShouldChange?.(true)
    } catch (error) {
      if (!isCurrent(id, credential)) return
      if (credential.Mode === 'local') {
        setStartRequest({ id, credential })
      } else {
        props.setCheckLog([`远程引擎连接失败：${String(error)}`])
        props.setYakitStatus('error')
        yakitNotify('error', String(error))
      }
    }
  })

  useEffect(() => {
    const start = () => {
      void engineTest()
    }
    emiter.on('startAndCreateEngineProcess', start)
    return () => {
      emiter.off('startAndCreateEngineProcess', start)
    }
  }, [])

  useDebounceEffect(
    () => {
      if (!startRequest || startingUp.current) return
      const { id, credential } = startRequest
      if (!isCurrent(id, credential) || credential.Mode !== 'local') return
      startingUp.current = true
      let actualPort = credential.Port
      outputToWelcomeConsole(`开始启动本地引擎，端口：${credential.Port}`)
      grpcStartLocalEngine({
        port: credential.Port,
        password: credential.Password,
        version: __PLATFORM__,
        isEnpriTraceAgent: isEnpriTraceAgent(),
        softwareVersion: FetchSoftwareVersion(),
      })
        .then(async (result) => {
          if (!isCurrent(id, credential)) return
          if (result.ok && result.status === 'success') {
            const port = result.port ?? credential.Port
            actualPort = port
            if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('引擎返回的端口无效')
            if (props.onLocalEngineStarted) {
              const accepted = await props.onLocalEngineStarted(port, credential)
              if (!accepted) return
            } else if (port !== credential.Port) {
              await yakitEngine.connectYaklangEngine({ ...credential, Port: port })
            }
            if (!isCurrent(id, credential, port)) return
            props.onKeepaliveShouldChange?.(true)
            return
          }
          if (result.status === 'cancelled') {
            props.setCheckLog([result.message || '本地引擎启动已取消'])
            props.setYakitStatus('break')
            return
          }
          props.setCheckLog([result.message || `本地引擎启动失败：${result.status}`])
          props.setYakitStatus(
            result.status === 'timeout'
              ? 'start_timeout'
              : result.status === 'port_occupied'
                ? 'port_occupied'
                : 'error',
          )
        })
        .catch((error) => {
          if (!isCurrent(id, credential, actualPort)) return
          debugToPrintLog(`[ERROR] 本地引擎启动失败：${String(error)}`)
          props.setCheckLog([`本地引擎启动失败：${String(error)}`])
          props.setYakitStatus('error')
        })
        .finally(() => {
          if (id === latestStartCallIdRef.current) startingUp.current = false
        })
    },
    [startRequest],
    { leading: false, wait: 1000 },
  )

  useEffect(() => {
    if (!props.keepalive) {
      props.onFailed?.(100)
      return
    }
    let active = true
    let pending = false
    let failedCount = 0
    const connect = async () => {
      if (pending) return
      pending = true
      try {
        await isEngineConnectionAlive()
        if (!active || !mountedRef.current || latestProps.current.yakitStatus === 'break') return
        failedCount = 0
        props.onReady?.()
      } catch {
        if (!active || !mountedRef.current || latestProps.current.yakitStatus === 'break') return
        failedCount++
        props.onFailed?.(failedCount)
      } finally {
        pending = false
      }
    }
    void connect()
    const timer = setInterval(connect, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [props.keepalive, props.onReady, props.onFailed, props.credential])

  return null
})
