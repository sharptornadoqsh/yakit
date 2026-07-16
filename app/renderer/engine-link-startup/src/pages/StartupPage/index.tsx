import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useMemoizedFn, useUpdateEffect } from 'ahooks'
import {
  DragHeaderHeight,
  handleFetchArchitecture,
  handleFetchIsDev,
  handleFetchSystem,
  outputToWelcomeConsole,
  SystemInfo,
} from './utils'
import {
  grpcFetchBuildInYakVersion,
  grpcFetchLocalYakitVersion,
  grpcFetchYakInstallResult,
  grpcInitCVEDatabase,
  grpcReclaimDatabaseSpace,
  grpcUnpackBuildInYak,
} from './grpc'
import { debugToPrintLog } from '@/utils/logCollection'
import { LocalGVS } from '@/enums/yakitGV'
import {
  ModalIsTop,
  System,
  TypeCallbackExtra,
  YakitStatusType,
  YaklangEngineMode,
  YaklangEngineWatchDogCredential,
} from './types'
import { getLocalValue, setLocalValue } from '@/utils/kv'
import useGetSetState from '@/hooks/useGetSetState'
import { DownloadYaklang } from './components/DownloadYaklang'
import {
  GetConnectPort,
  isCommunityEdition,
  isCommunityIRify,
  isCommunityMemfit,
  isEnpriTrace,
  isEnpriTraceAgent,
  isEnpriTraceIRify,
  isMemfit,
} from '@/utils/envfile'
import { RemoteEngine } from './components/RemoteEngine/RemoteEngine'
import { RemoteLinkInfo } from './components/RemoteEngine/RemoteEngineType'
import { StringToUint8Array } from '@/utils/str'
import { LocalEngine } from './components/LocalEngine'
import { LocalEngineLinkFuncProps, LocalLinkParams } from './components/LocalEngine/LocalEngineType'
import emiter from '@/utils/eventBus/eventBus'
import { YaklangEngineWatchDog } from './components/YaklangEngineWatchDog'
import { useTheme } from '@/hooks/useTheme'
import { StartupSplash } from './components/StartupSplash'
import { yakitApp, yakitEngine } from '@/utils/electronBridge'
import { useYakitStatus } from '@/hooks/useYakitStatus'
import styles from './index.module.scss'
import {
  decideEngineStartup,
  engineLifecycleReducer,
  initialEngineLifecycleState,
  type EngineLifecycleStateName,
} from './engineLifecycle'

const DefaultCredential: YaklangEngineWatchDogCredential = {
  Host: '127.0.0.1',
  IsTLS: false,
  Password: '',
  PemBytes: undefined,
  Port: 0,
  Mode: undefined,
}

export const StartupPage: React.FC = () => {
  /** 是否置顶 */
  const [isTop, setIsTop] = useState<ModalIsTop>(0)
  /** 操作系统 */
  const [system, setSystem] = useState<System>('Darwin')
  /** 本地引擎自检输出日志 */
  const [checkLog, setCheckLog] = useState<string[]>(['正在进行环境检查...'])
  const [engineLifecycle, dispatchEngineLifecycle] = useReducer(engineLifecycleReducer, initialEngineLifecycleState)
  const transitionEngineLifecycle = useMemoizedFn(
    (
      state: EngineLifecycleStateName,
      message: string,
      extra: { progress?: number; error?: string; logPath?: string } = {},
    ) => {
      dispatchEngineLifecycle({ type: 'transition', state, message, ...extra })
    },
  )
  /** 引擎是否安装 */
  const isEngineInstalled = useRef<boolean>(false)
  /** 内置引擎版本号 */
  const [buildInEngineVersion, setBuildInEngineVersion, getBuildInEngineVersion] = useGetSetState<string>('')
  /** 当前引擎模式 */
  const [engineMode, setEngineMode, getEngineMode] = useGetSetState<YaklangEngineMode>()
  const onSetEngineMode = useMemoizedFn((v?: YaklangEngineMode) => {
    setEngineMode(v)
    SystemInfo.mode = v
  })
  /** 是否为远程模式 */
  const isRemoteEngine = useMemo(() => engineMode === 'remote', [engineMode])
  /** 手动点击中断连接 */
  const breakHandleRef = useRef<boolean>(false)
  /** yakit使用状态 请用 safeSetYakitStatus 设置状态 */
  const { yakitStatus, getYakitStatus, safeSetYakitStatus } = useYakitStatus(breakHandleRef)
  /** 手动点击倒计时连接取消 */
  const cancelCountdownLinkRef = useRef<boolean>(false)
  /** 倒计时步数（2秒共4步，每0.5秒递减1） */
  const [, setCountdown] = useState<number>(4)
  /** 倒计时定时器引用 */
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null)
  /** 当前引擎连接状态 */
  const [engineLink, setEngineLink, getEngineLink] = useGetSetState<boolean>(false)
  /** 是否阻止发送打开主窗口 */
  const isStopSend = useRef<boolean>(false)
  /** 是否初始启动连接 */
  const isInitLocalLink = useRef<boolean>(true)
  /** 是否检查版本更新 */
  const isCheckVersion = useRef<boolean>(true)
  // 本地连接ref
  const localEngineRef = useRef<LocalEngineLinkFuncProps>(null)
  /** 认证信息 */
  const [credential, setCredential, getCredential] = useGetSetState<YaklangEngineWatchDogCredential>({
    ...DefaultCredential,
  })
  /** 阻止接收主窗口发送过来的error状态 */
  const stopErrorStatusRef = useRef<boolean>(false)
  // 是否持续监听引擎进程的连接状态
  const [keepalive, setKeepalive, getKeepalive] = useGetSetState<boolean>(false)
  /** 本地连接自定义端口号 */
  const [customPort, setCustomPort, getCustomPort] = useGetSetState<number>(GetConnectPort())
  /** 主题 */
  const { theme } = useTheme()

  // #region 软件启动主流程（单一入口）
  /**
   * 获取基本信息
   * 1、操作系统类型
   * 2、是否开发环境
   * 3、架构
   */
  useEffect(() => {
    handleFetchSystem((sys) => {
      setSystem(sys || 'Windows_NT')
    })
    handleFetchIsDev()
    handleFetchArchitecture()
  }, [])

  useEffect(() => {
    handleLinkEngineMode()
  }, [])
  // #endregion

  /** 插件漏洞信息库自检 */
  const handleBuiltInCheck = useMemoizedFn(() => {
    grpcInitCVEDatabase().catch(() => {})
  })

  /**
   * 获取其他信息
   * 1、引擎是否存在
   * 2、内置引擎版本
   * 3、本地软件版本号、更新yak版本检测状态
   * 4、获取本地缓存连接端口号
   */
  const handleFetchBaseInfo = useMemoizedFn(async () => {
    debugToPrintLog(`------ 获取系统基础信息 ------`)
    const tasks: Array<() => Promise<any>> = []
    // 引擎 是否安装
    tasks.push(() =>
      grpcFetchYakInstallResult(true).then((isInstalled) => {
        isEngineInstalled.current = isInstalled
      }),
    )
    // 内置引擎版本
    tasks.push(() =>
      grpcFetchBuildInYakVersion(true).then((version) => {
        setBuildInEngineVersion(version)
      }),
    )
    // 新安装 Yakit ，引擎需检查更新
    tasks.push(() =>
      grpcFetchLocalYakitVersion(true).then((appVersion) => {
        return getLocalValue(LocalGVS.LocalAppVersion)
          .then((res) => {
            if (res !== appVersion) {
              setLocalValue(LocalGVS.NoYakVersionCheck, false)
              setLocalValue(LocalGVS.LocalAppVersion, appVersion)
            }
          })
          .catch(() => {})
      }),
    )
    // 获取本地缓存端口号
    tasks.push(() =>
      getCachedLocalModePort().then((port) => {
        if (typeof port === 'number') {
          setCustomPort(port)
        }
      }),
    )
    try {
      await Promise.allSettled(tasks.map((run) => run()))
    } catch (error) {}
  })

  const cacheLocalModePort = useMemoizedFn((port: number) => {
    if (getEngineMode() !== 'local') return
    if (isCommunityEdition()) {
      // ce
      if (isCommunityIRify()) {
        setLocalValue(LocalGVS.IrifyPort, port)
      } else if (isCommunityMemfit()) {
        setLocalValue(LocalGVS.MemfitPort, port)
      } else {
        setLocalValue(LocalGVS.YakitPort, port)
      }
    } else if (isEnpriTrace()) {
      // ee
      if (isEnpriTraceIRify()) {
        setLocalValue(LocalGVS.IrifyEEPort, port)
      } else if (isMemfit()) {
        // 暂时没有ai企业版
      } else {
        setLocalValue(LocalGVS.YakitEEPort, port)
      }
    } else if (isEnpriTraceAgent()) {
      // se
      setLocalValue(LocalGVS.SEPort, port)
    }
  })

  const getCachedLocalModePort = async (): Promise<number | undefined> => {
    if (isCommunityEdition()) {
      // CE
      if (isCommunityIRify()) {
        return getLocalValue(LocalGVS.IrifyPort)
      } else if (isCommunityMemfit()) {
        return getLocalValue(LocalGVS.MemfitPort)
      } else {
        return getLocalValue(LocalGVS.YakitPort)
      }
    } else if (isEnpriTrace()) {
      // EE
      if (isEnpriTraceIRify()) {
        return getLocalValue(LocalGVS.IrifyEEPort)
      } else if (isMemfit()) {
        return undefined
      } else {
        return getLocalValue(LocalGVS.YakitEEPort)
      }
    } else if (isEnpriTraceAgent()) {
      // SE
      return getLocalValue(LocalGVS.SEPort)
    }
  }

  /** 获取上次连接引擎的模式 */
  const handleLinkEngineMode = useMemoizedFn(async () => {
    debugToPrintLog(`------ 获取上次连接引擎的模式 ------`)
    setCheckLog(['获取上次连接引擎的模式...'])
    const mode = await getLocalValue(LocalGVS.YaklangEngineMode).catch(() => undefined)
    if (mode === 'remote') {
      setCheckLog((current) => current.concat(['获取连接模式成功——远程模式']))
      transitionEngineLifecycle('remote', '等待连接已选择的远程引擎')
      debugToPrintLog(`------ 连接引擎的模式: remote ------`)
      handleChangeLinkMode(true)
      return
    }

    setCheckLog((current) =>
      current.concat([mode === 'local' ? '获取连接模式成功——本地模式' : '未获取到连接模式——使用本地模式']),
    )
    transitionEngineLifecycle('checking-local', '正在检查本地引擎与预置工件')
    await handleFetchBaseInfo()
    handleBuiltInCheck()
    debugToPrintLog(`------ 连接引擎的模式: local ------`)
    handleChangeLinkMode()
  })

  // 切换连接模式
  const handleChangeLinkMode = useMemoizedFn((isRemote?: boolean) => {
    // 可能isRemoteEngine状态值没有变
    setTimeout(() => {
      setCheckLog([])
      if (!!isRemote) {
        handleLinkRemoteMode()
      } else {
        handleLinkLocalMode()
      }
    }, 500)
  })

  // 本地连接的两种模式
  const handleStartLocalLink = useMemoizedFn((isInit: boolean) => {
    debugToPrintLog(`------ 开始执行本地连接 ------`)
    if (isInit) {
      if (localEngineRef.current) localEngineRef.current.init(getCustomPort())
    } else {
      if (localEngineRef.current) localEngineRef.current.link(getCustomPort())
    }
  })

  // 切换远程模式
  const handleLinkRemoteMode = useMemoizedFn(() => {
    onDisconnect()
    safeSetYakitStatus('')
    onSetEngineMode('remote')
    transitionEngineLifecycle('remote', '请确认远程引擎连接信息')
  })

  // 本地连接的状态设置
  const setLinkLocalEngine = useMemoizedFn(() => {
    onDisconnect()
    safeSetYakitStatus('')
    onSetEngineMode('local')
    transitionEngineLifecycle('ready-local', '本地引擎文件可用，正在检查兼容能力')
    debugToPrintLog(`------ 启动环境检查逻辑 ------`)
    // 等YakitStatus更新
    setTimeout(() => {
      handleStartLocalLink(isCheckVersion.current)
      isInitLocalLink.current = false
    }, 500)
  })

  // 切换本地模式
  const handleLinkLocalMode = useMemoizedFn(() => {
    onSetEngineMode('local')
    const decision = decideEngineStartup({
      mode: 'local',
      local: {
        exists: isEngineInstalled.current,
        compatibility: 'unknown',
        updateAvailable: false,
      },
      bundled: { exists: Boolean(getBuildInEngineVersion()) },
    })

    if (decision.action === 'start-local') {
      if (!isInitLocalLink.current) {
        setLinkLocalEngine()
        return
      }
      setCheckLog(['检查本地是否已安装引擎...', '本地已安装引擎，准备环境检查中...'])
      setTimeout(() => {
        setLinkLocalEngine()
      }, 500)
      return
    }

    if (decision.action === 'extract-bundled') {
      debugToPrintLog(`------ 启动无本地引擎逻辑 ------`)
      setCheckLog(['检查本地是否已安装引擎...', '本地没有引擎文件...'])
      transitionEngineLifecycle('extracting-bundled', `正在准备预置引擎 ${getBuildInEngineVersion()}`)
      safeSetYakitStatus('install')
      initializeEngine(() => {
        isEngineInstalled.current = true
        safeSetYakitStatus('')
        setLinkLocalEngine()
      })
      return
    }

    transitionEngineLifecycle('missing', '未找到本地引擎或已验证的预置工件')
    setCheckLog(['未找到仓库预置引擎，请检查兼容清单与 bins 目录'])
    safeSetYakitStatus('installNetWork')
  })
  // #endregion

  // #region Yak引擎、Yakit下载更新逻辑
  // 检测到新版yakit的弹窗显示
  const [yakitUpdate, setYakitUpdate] = useState<boolean>(false)
  /** 指定下载引擎版本 */
  const [yaklangSpecifyVersion, setYaklangSpecifyVersion] = useState<string>('')
  // 更新yaklang-modal
  const [yaklangDownload, setYaklangDownload] = useState<boolean>(false)
  const onDownloadedYaklang = useMemoizedFn((isOk: boolean) => {
    setYaklangDownload(false)
    const statusArr: YakitStatusType[] = ['installNetWork', 'skipAgreement_InstallNetWork', 'old_version']
    if (statusArr.includes(getYakitStatus())) {
      setRestartLoading(false)
      isCheckVersion.current = true
      if (!isOk) {
        return
      }
    } else {
      isCheckVersion.current = false
    }
    if (isOk) {
      isEngineInstalled.current = true
    }
    breakHandleRef.current = false
    setYaklangSpecifyVersion('')
    setLinkLocalEngine()
  })

  // 判断引擎版本没有问题，则直接安装，否则重新下载
  const yakEngineVersionExistsAndCorrectness = async (
    version: string,
    installSuccessCallback: () => void,
    installErrCallback: (err) => void,
    errCallback: () => void,
  ) => {
    try {
      const res = await yakitEngine.verifyYakEngineVersion(version)
      if (res === true) {
        // 清空主进程yaklang版本缓存
        yakitEngine.clearLocalYaklangVersionCache()
        yakitEngine
          .installYakEngine(version)
          .then(() => {
            installSuccessCallback()
          })
          .catch((err: any) => {
            installErrCallback(err)
          })
      } else {
        errCallback && errCallback()
      }
    } catch (error) {
      errCallback && errCallback()
    }
  }
  // 下载指定版本引擎
  useUpdateEffect(() => {
    if (yaklangSpecifyVersion) {
      killCurrentProcess(() => {
        yakEngineVersionExistsAndCorrectness(
          yaklangSpecifyVersion,
          () => {
            setYaklangSpecifyVersion('')
            breakHandleRef.current = false
            isCheckVersion.current = false
            setLinkLocalEngine()
          },
          (err) => {
            setYaklangSpecifyVersion('')
            breakHandleRef.current = false
            isCheckVersion.current = false
            setCheckLog([`安装失败：${String(err)}，继续使用原有引擎`])
            transitionEngineLifecycle('recoverable-error', '安装失败，原有可用引擎仍然保留', {
              error: String(err),
            })
            setLinkLocalEngine()
          },
          () => {
            setYaklangDownload(true)
          },
        )
      }, [getCustomPort()])
    }
  }, [yaklangSpecifyVersion])
  // #endregion

  // #region 初始化界面操作
  // 手动重连时按钮的loading
  const [, setRestartLoading] = useState<boolean>(false)
  const setTimeoutLoading = useMemoizedFn((setLoading: (v: boolean) => any, time = 2000) => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
    }, time)
  })
  useEffect(() => {
    if (engineLink) {
      setRestartLoading(false)
    }
  }, [engineLink])
  // 解压内置引擎
  const initializeEngine = useMemoizedFn((callback = () => {}) => {
    setCheckLog([`准备解压内置引擎：${getBuildInEngineVersion()}...`])
    transitionEngineLifecycle('extracting-bundled', `正在验证并提取预置引擎 ${getBuildInEngineVersion()}`)
    setRestartLoading(true)
    setTimeout(async () => {
      try {
        await grpcUnpackBuildInYak(true)
        transitionEngineLifecycle('ready-local', `预置引擎 ${getBuildInEngineVersion()} 已安装`)
        safeSetYakitStatus('')
        callback()
      } catch (error) {
        setCheckLog([
          isInitLocalLink.current
            ? '预置引擎初始化失败，可重试、查看日志或选择其他安装方式'
            : `预置引擎提取失败：${error}`,
        ])
        transitionEngineLifecycle('recoverable-error', '预置引擎恢复失败，原有可用版本未被删除', {
          error: `${error}`,
        })
        safeSetYakitStatus('skipAgreement_Install')
      } finally {
        setRestartLoading(false)
      }
    }, 500)
  })

  // 回收数据库空间
  const reclaimDbSpacePath = useRef<string[]>([])
  const handleReclaimDatabaseSpace = useMemoizedFn(async () => {
    const allDb = reclaimDbSpacePath.current.length === 0
    setCheckLog([
      `回收${allDb ? '所有' : ''}数据库空间中，请勿关闭软件${allDb ? '，预计耗时较长' : ''}`,
      '退出或关闭可能会造成数据库损坏',
    ])
    try {
      const res = await grpcReclaimDatabaseSpace({ dbPath: reclaimDbSpacePath.current })
      setRestartLoading(false)
      if (res.ok && res.status === 'success') {
        setCheckLog(['回收完成，请点击手动连接引擎'])
        safeSetYakitStatus('reclaimDatabaseSpace_success')
        return
      }
      setCheckLog(['回收失败，可将日志信息发送给工作人员处理...'])
      safeSetYakitStatus('reclaimDatabaseSpace_error')
    } catch (error) {
      // 如果意外情况，重新连接引擎
      outputToWelcomeConsole(`回收出现意外情况：${error}`)
      setCheckLog(['回收出现意外情况，可查看日志详细信息...'])
      safeSetYakitStatus('reclaimDatabaseSpace_error')
    }
  })
  // #endregion

  const killCurrentProcess = useMemoizedFn((callback: () => void, extraPorts?: number[]) => {
    // ---------- 1. PS 查询所有 yak 进程 ----------
    yakitEngine
      .listYakGrpc()
      .then(async (res) => {
        // 查找 PID
        const pidsToKill = res
          .filter((p) => extraPorts.includes(Number(p.port)))
          .map((p) => p.pid)
          .filter(Boolean)

        if (pidsToKill.length === 0) {
          callback()
          return
        }

        // ---------- 2. kill ----------
        for (const pid of pidsToKill) {
          try {
            await yakitEngine.killYakGrpc(pid)
            debugToPrintLog(`------ terminated engine process: ${pid} ------`)
          } catch (err) {
            debugToPrintLog(`------ terminate engine process failed: ${err} ------`)
          }
        }

        callback()
      })
      .catch(() => {
        callback()
      })
  })

  // #region 远程连接&本地连接
  const [remoteLinkLoading, setRemoteLinkLoading] = useState<boolean>(false)
  // 开始远程连接引擎
  const handleLinkRemoteEngine = useMemoizedFn((info: RemoteLinkInfo) => {
    breakHandleRef.current = false
    cancelCountdownLinkRef.current = false
    safeSetYakitStatus('')
    setTimeoutLoading(setRemoteLinkLoading)
    setCredential({
      Host: info.host,
      IsTLS: info.tls,
      Password: info.tls ? info.password : '',
      PemBytes: StringToUint8Array(info.tls ? info.caPem || '' : ''),
      Port: parseInt(info.port),
      Mode: 'remote',
    })
    transitionEngineLifecycle('remote', `正在连接远程引擎 ${info.host}:${info.port}`)
    onStartLinkEngine()
  })
  // 远程切换本地
  const handleRemoteToLocal = useMemoizedFn(() => {
    breakHandleRef.current = false
    cancelCountdownLinkRef.current = false
    setCheckLog([])
    onSetEngineMode(undefined)
    handleChangeLinkMode()
  })

  // 开始本地连接引擎
  const handleLinkLocalEngine = useMemoizedFn((params: LocalLinkParams) => {
    debugToPrintLog(`------ 开始启动引擎, 指定端口: ${params.port} ------`)
    setCheckLog([`本地普通权限引擎模式，开始启动本地引擎-端口: ${params.port}`])
    setCredential({
      Host: '127.0.0.1',
      IsTLS: false,
      Password: params.secret || '',
      PemBytes: undefined,
      Port: params.port,
      Mode: 'local',
    })
    transitionEngineLifecycle('starting', `正在启动本地引擎，端口 ${params.port}`)
    safeSetYakitStatus('ready')
    onStartLinkEngine()
  })

  // 断开连接
  const onDisconnect = useMemoizedFn(() => {
    setCredential({ ...DefaultCredential })
    setKeepalive(false)
    setEngineLink(false)
  })

  // 安全设置 keepalive，当手动点中断连接的时候，不需要再探测引擎是否存活
  const safeSetKeepalive = useMemoizedFn((value: boolean) => {
    if (breakHandleRef.current) {
      return
    }
    setKeepalive(value)
  })

  // 开始连接引擎
  const onStartLinkEngine = useMemoizedFn(() => {
    isStopSend.current = false
    setTimeout(() => {
      emiter.emit('startAndCreateEngineProcess')
    }, 100)
  })
  // #endregion

  /**
   * 启动引擎进程的监听，用于显示启动进程错误时的报错信息
   */
  useEffect(() => {
    const offStartEngineError = yakitEngine.onStartYaklangEngineError((error: string) => {
      setCheckLog((arr) => arr.concat([`${error}`]))
      transitionEngineLifecycle('recoverable-error', '本地引擎启动失败，可重试或查看日志', { error })
    })
    return () => {
      offStartEngineError()
    }
  }, [])

  useEffect(() => {
    const offLifecycleStage = yakitEngine.onEngineLifecycleStage((stage) => {
      transitionEngineLifecycle(stage.state, stage.message, {
        progress: stage.progress,
        error: stage.error,
      })
    })
    return () => offLifecycleStage()
  }, [])

  useEffect(() => {
    if (yakitStatus === 'old_version') {
      transitionEngineLifecycle('incompatible', '当前本地引擎未通过兼容能力检查')
    } else if (
      yakitStatus === 'allow-secret-error' ||
      yakitStatus === 'check_timeout' ||
      yakitStatus === 'start_timeout' ||
      yakitStatus === 'error'
    ) {
      transitionEngineLifecycle('recoverable-error', '引擎启动遇到可恢复错误')
    } else if (
      (yakitStatus === 'installNetWork' || yakitStatus === 'skipAgreement_InstallNetWork') &&
      engineLifecycle.state !== 'recoverable-error'
    ) {
      transitionEngineLifecycle('missing', '未找到可用的本地或仓库预置引擎')
    }
  }, [yakitStatus])

  // #region 连接成功
  const onReady = useMemoizedFn(() => {
    const statusArr: YakitStatusType[] = ['break', 'link_countdown', 'link']
    if (statusArr.includes(getYakitStatus())) {
      return
    }
    if (getKeepalive()) {
      transitionEngineLifecycle('connected', getEngineMode() === 'remote' ? '远程引擎已连接' : '本地引擎已连接')
      setCheckLog([])
      if (getEngineMode() === 'local') {
        // 先设置倒计时状态
        safeSetYakitStatus('link_countdown')
        setCountdown(4)
        // 清除之前的定时器
        clearCountDownTime()
        // 2 秒倒计时，每 0.5 秒递减一次（共 4 步）
        let currentCount = 4
        countdownTimerRef.current = setInterval(() => {
          currentCount -= 1
          setCountdown(currentCount)

          if (currentCount <= 0) {
            clearCountDownTime()
            if (getYakitStatus() === 'link_countdown') {
              safeSetYakitStatus('link')
              setEngineLink(true)
            }
          }
        }, 500)
      } else {
        safeSetYakitStatus('link')
        setEngineLink(true)
      }
    }
  })

  // 清理倒计时定时器
  const clearCountDownTime = useMemoizedFn(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  })
  useEffect(() => {
    return () => {
      clearCountDownTime()
    }
  }, [])

  // 引擎连接成功发送数据到主界面
  useEffect(() => {
    if (engineLink && getYakitStatus() === 'link' && getCredential().Port && !isStopSend.current) {
      yakitApp.completeEngineLink({ credential: getCredential() })
    }
  }, [engineLink, yakitStatus])

  // 主界面远程连接引擎更新认证信息
  useEffect(() => {
    const offCredentialUpdate = yakitApp.onCredentialUpdate((data) => {
      const credential = data.credential
      setCredential(credential)
      onSetEngineMode(credential.Mode)
      isStopSend.current = true
    })
    return () => {
      offCredentialUpdate()
    }
  }, [])

  /**
   * 1、清空日志信息|将远程连接loading置为false(不管是不是远程连接)|
   * 2、执行连接成功的外界回调事件
   * 3、连接成功缓存连接模式
   * 4、开启引擎文件的存在监控
   */
  useEffect(() => {
    if (engineLink) {
      setCheckLog([])
      setRemoteLinkLoading(false)

      stopErrorStatusRef.current = false

      setLocalValue(LocalGVS.YaklangEngineMode, getEngineMode())

      // 缓存连接端口
      cacheLocalModePort(+getCredential().Port || +getCustomPort() || GetConnectPort())

      const waitTime: number = 5000
      const id = setInterval(() => {
        grpcFetchYakInstallResult(true)
          .then((flag: boolean) => {
            if (isEngineInstalled.current === flag) return
            isEngineInstalled.current = flag
            isInitLocalLink.current = true
            isCheckVersion.current = true
            breakHandleRef.current = false
            cancelCountdownLinkRef.current = false
            // 清空主进程yaklang版本缓存
            yakitEngine.clearLocalYaklangVersionCache()
          })
          .catch(() => {})

        grpcFetchBuildInYakVersion(true)
          .then((version) => {
            setBuildInEngineVersion(version)
          })
          .catch(() => {})
      }, waitTime)
      return () => {
        clearInterval(id)
      }
    } else {
      // 清空主进程yaklang版本缓存
      yakitEngine.clearLocalYaklangVersionCache()
    }
  }, [engineLink])
  // #endregion

  const onFailed = useMemoizedFn((count) => {
    // 10以上的次数属于无效次数
    if (count > 10) {
      setKeepalive(false)
      return
    }

    debugToPrintLog(`[INFO] 目标引擎进程不存在: 探活失败${count}次`)
    setEngineLink(false)

    if (getYakitStatus() === 'error' && count === 10) {
      // 连接断开后的10次尝试过后，不在进行尝试
      setCheckLog(['请点击手动连接引擎，再次尝试'])
      return
    }

    // 连接中触发
    if (getYakitStatus() === 'link') {
      if (getEngineMode() === 'remote') {
        handleLinkRemoteMode()
      } else if (getEngineMode() === 'local') {
        setCheckLog(['引擎连接未成功, 正在尝试重连'])
        if (count > 4) {
          safeSetYakitStatus('error')
        }
      }
    }
  })

  // 主界面发送有关引擎操作的信息到连接界面
  useEffect(() => {
    const offFromMainWindow = yakitApp.onFromMainWindow((data) => {
      const type = data.yakitStatus
      if (type) {
        handleOperations(type, data)
      }
    })
    return () => {
      offFromMainWindow()
    }
  }, [])
  const handleOperations = useMemoizedFn((type: YakitStatusType | YaklangEngineMode, extra?: TypeCallbackExtra) => {
    switch (type) {
      case 'skipAgreement_InstallNetWork': // 小风车重置引擎失败
        setCheckLog([`预置引擎恢复失败：${extra?.message || '未知原因'}，请检查仓库工件后重试`])
        onDisconnect()
        onSetEngineMode(undefined)
        safeSetYakitStatus('skipAgreement_Install')
        break
      case 'break': // 主动中断连接 或 小风车断开引擎
        safeSetYakitStatus('break')
        onDisconnect()
        setCheckLog(['已主动断开, 请点击手动连接引擎'])
        break
      case 'reclaimDatabaseSpace_start':
        stopErrorStatusRef.current = true
        reclaimDbSpacePath.current = extra?.dbPath || []
        onDisconnect()
        safeSetYakitStatus('reclaimDatabaseSpace_start')
        handleReclaimDatabaseSpace()
        break
      case 'install': // 下载的yaklang时候，或切换本地时 --- 本地引擎不存在
        onDisconnect()
        isEngineInstalled.current = false
        setTimeout(() => {
          handleLinkLocalMode()
        }, 500)
        return
      case 'installNetWork':
        onDisconnect()
        isEngineInstalled.current = false
        safeSetYakitStatus('install')
        setTimeout(() => {
          handleLinkLocalMode()
        }, 500)
        return
      case 'error':
        if (stopErrorStatusRef.current) return
        setEngineLink(false)
        safeSetYakitStatus('error')
        break
      case 'local':
        onDisconnect()
        onSetEngineMode(undefined)
        isCheckVersion.current = false
        setTimeout(() => {
          handleLinkLocalMode()
        }, 500)
        break
      case 'remote':
        setTimeout(() => {
          handleLinkRemoteMode()
        }, 500)
        break
      default:
        break
    }
  })

  return (
    <div className={styles['startup-wrapper']}>
      <div className={styles['startup-header-drap']} style={{ height: DragHeaderHeight }}></div>
      <StartupSplash theme={theme} />
      <div className={styles['startup-operation-layer']} aria-hidden="true">
        <YaklangEngineWatchDog
          credential={credential}
          keepalive={keepalive}
          engineLink={engineLink}
          onKeepaliveShouldChange={safeSetKeepalive}
          onReady={onReady}
          onFailed={onFailed}
          yakitStatus={yakitStatus}
          setYakitStatus={safeSetYakitStatus}
          setCheckLog={setCheckLog}
        />
        {!isRemoteEngine ? (
          <LocalEngine
            ref={localEngineRef}
            setLog={setCheckLog}
            onLinkEngine={handleLinkLocalEngine}
            yakitStatus={yakitStatus}
            setYakitStatus={safeSetYakitStatus}
            buildInEngineVersion={buildInEngineVersion}
            setRestartLoading={setRestartLoading}
            yakitUpdate={yakitUpdate}
            setYakitUpdate={setYakitUpdate}
          />
        ) : (
          !engineLink && (
            <RemoteEngine
              loading={remoteLinkLoading}
              setLoading={setRemoteLinkLoading}
              onSubmit={handleLinkRemoteEngine}
              autoConnect={true}
              headless={true}
              onSwitchLocalEngine={handleRemoteToLocal}
            />
          )
        )}
        {!isRemoteEngine && !engineLink && yaklangDownload && (
          <DownloadYaklang
            isTop={isTop}
            setIsTop={setIsTop}
            yaklangSpecifyVersion={yaklangSpecifyVersion}
            system={system}
            visible={yaklangDownload}
            headless={true}
            onCancel={onDownloadedYaklang}
          />
        )}
      </div>
    </div>
  )
}
