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
  grpcFixupDatabase,
  grpcInitCVEDatabase,
  grpcReclaimDatabaseSpace,
  grpcUnpackBuildInYak,
} from './grpc'
import { debugToPrintLog } from '@/utils/logCollection'
import { LocalGVS } from '@/enums/yakitGV'
import {
  IgnoreYakit,
  LoadingClickExtra,
  ModalIsTop,
  System,
  TypeCallbackExtra,
  YakitStatusType,
  YaklangEngineMode,
  YaklangEngineWatchDogCredential,
} from './types'
import { getLocalValue, setLocalValue } from '@/utils/kv'
import useGetSetState from '@/hooks/useGetSetState'
import { yakitNotify } from '@/utils/notification'
import { EngineLifecyclePanel } from './components/EngineLifecyclePanel'
import { DownloadYaklang } from './components/DownloadYaklang'
import {
  FetchSoftwareVersion,
  GetConnectPort,
  getReleaseEditionName,
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
import { EngineLog } from './components/EngineLog'
import emiter from '@/utils/eventBus/eventBus'
import { YaklangEngineWatchDog } from './components/YaklangEngineWatchDog'
import renyanLogoLight from '@/assets/renyan-logo-light.svg'
import renyanLogoDark from '@/assets/renyan-logo-dark.svg'
import { useTheme } from '@/hooks/useTheme'
import { SoftwareBasics } from './components/SoftwareBasics'
import { yakitApp, yakitEngine } from '@/utils/electronBridge'
import { useYakitStatus } from '@/hooks/useYakitStatus'
import styles from './index.module.scss'
import { productConfig } from '@/config/product'
import { handleOpenFileSystemDialog } from '@/utils/fileSystemDialog'
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
  /** 工作空间是否已确认（所有平台均需用户确认） */
  const [workspaceConfirmed, setWorkspaceConfirmed] = useState<boolean>(false)

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
  const [countdown, setCountdown] = useState<number>(4)
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
  const { theme, setTheme } = useTheme()

  // #region 工作空间确认回调
  const handleWorkspaceConfirmed = useMemoizedFn(() => {
    setWorkspaceConfirmed(true)
  })
  // #endregion

  // #region 软件启动主流程（单一入口）所有平台均需要用户确认工作空间
  /**
   * 获取基本信息
   * 1、操作系统类型（决定是否需要工作空间前置选择）
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

  // workspaceConfirmed 为 true 后，优先读取用户选择的引擎模式
  useEffect(() => {
    if (!workspaceConfirmed) return
    handleLinkEngineMode()
  }, [workspaceConfirmed])
  // #endregion

  /** 插件漏洞信息库自检 */
  const handleBuiltInCheck = useMemoizedFn(() => {
    grpcInitCVEDatabase()
      .then(() => {
        yakitNotify('info', '漏洞信息库自检完成')
      })
      .catch((e: any) => {})
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

  // yakit不再提示更新
  const noHintYakitUpdate = useMemoizedFn((ignoreYakit: IgnoreYakit) => {
    safeSetYakitStatus('')
    if (ignoreYakit === 'ignoreUpdates') {
      setLocalValue(LocalGVS.NoAutobootLatestVersionCheck, true)
    }
    if (localEngineRef.current) {
      localEngineRef.current.checkEngine()
    }
  })

  // yak不再提示更新
  const noHintYakUpdate = useMemoizedFn(() => {
    safeSetYakitStatus('')
    setLocalValue(LocalGVS.NoYakVersionCheck, true)
    if (localEngineRef.current) {
      localEngineRef.current.checkEngineSource()
    }
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
            yakitNotify('info', '已检测到本地存在对应版本引擎，直接进行安装')
            yakitNotify('success', `安装成功，如未生效，重启 ${getReleaseEditionName()} 即可`)
            installSuccessCallback()
          })
          .catch((err: any) => {
            yakitNotify(
              'error',
              `安装失败：${err.message.indexOf('operation not permitted') > -1 ? '请关闭引擎后重试' : String(err)}`,
            )
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
  const [restartLoading, setRestartLoading] = useState<boolean>(false)
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
  // Loading页面切换引擎连接模式
  const loadingClickCallback = useMemoizedFn((type: YaklangEngineMode | YakitStatusType, extra?: LoadingClickExtra) => {
    switch (type) {
      case 'install':
        // 解压内置引擎
        initializeEngine(() => {
          isEngineInstalled.current = true
          setCheckLog([`预置引擎 ${getBuildInEngineVersion()} 已验证并安装`])
          safeSetYakitStatus('')
          setLinkLocalEngine()
        })
        return
      case 'installNetWork':
        // 一键安装（联网）
        setRestartLoading(true)
        setYaklangDownload(true)
        return
      case 'check_timeout':
        // 超时手动校验引擎
        setRestartLoading(true)
        handleStartLocalLink(isCheckVersion.current)
        return
      case 'port_occupied_prev':
        // 端口被占用前置操作
        if (extra?.killCurProcess) {
          setRestartLoading(true)
          killCurrentProcess(() => {
            handleStartLocalLink(isCheckVersion.current)
          }, [getCustomPort()])
        } else {
          safeSetYakitStatus('port_occupied')
        }
        return
      case 'port_occupied':
        // 端口被占用
        setRestartLoading(true)
        setCustomPort(extra.port)
        handleStartLocalLink(isCheckVersion.current)
        return
      case 'start_timeout':
        // 启动yak超时
        setTimeoutLoading(setRestartLoading, 5000)
        onStartLinkEngine()
        return
      case 'remote':
        handleLinkRemoteMode()
        return
      case 'local':
        handleLinkLocalMode()
        return
      case 'database_error':
      case 'fix_database_timeout':
        setRestartLoading(true)
        // 校验数据库出现错误或超时
        handleFixupDatabase()
        return
      case 'update_yakit':
        // 检测到新版本yakit
        if (extra?.downYakit) {
          setRestartLoading(true)
          setYakitUpdate(true)
        } else {
          noHintYakitUpdate(extra?.ignoreYakit)
        }
        return
      case 'update_yak':
        // 检测到当前版本低于内置版本
        if (extra?.downYak) {
          initializeEngine(() => {
            setCheckLog([`引擎：${getBuildInEngineVersion()}，解压成功`])
            if (localEngineRef.current) {
              localEngineRef.current.checkEngineSource(getBuildInEngineVersion())
            }
          })
        } else {
          noHintYakUpdate()
        }
        return
      case 'check_yak_version_error':
        // 引擎权限错误-手动重启引擎
        setRestartLoading(true)
        setLinkLocalEngine()
        return
      case 'error':
        // 引擎连接超时或意外断掉连接
        setTimeoutLoading(setRestartLoading)
        handleStartLocalLink(false)
        isCheckVersion.current = false
        setKeepalive(false)
        return
      case 'reclaimDatabaseSpace_success':
      case 'reclaimDatabaseSpace_error':
        // 回收数据库空间成功或者失败
        setRestartLoading(true)
        safeSetYakitStatus('')
        setTimeout(() => {
          handleStartLocalLink(isCheckVersion.current)
        }, 500)
        break
      case 'break':
        // 用户点中断连接 或 手动连接引擎
        if (extra?.linkAgain) {
          // 手动点倒计时取消，再点连接
          if (cancelCountdownLinkRef.current) {
            cancelCountdownLinkRef.current = false
            // 立即进入
            setEngineLink(true)
            safeSetYakitStatus('link')
          } else {
            breakHandleRef.current = false
            safeSetYakitStatus('')
            killCurrentProcess(() => {
              setTimeout(() => {
                handleStartLocalLink(isCheckVersion.current)
              }, 500)
            }, [getCustomPort()])
          }
        } else {
          // 否则执行断开
          outputToWelcomeConsole('手动触发中断连接')
          debugToPrintLog(`------ 手动触发中断连接 ------`)
          safeSetYakitStatus('break')
          onDisconnect()
          setCheckLog(['已主动断开, 请点击手动连接引擎'])
          breakHandleRef.current = true
          setRestartLoading(false)
          cancelAllTasks()
          setTimeout(() => {
            if (extra.isRemote) {
              handleLinkRemoteMode()
            }
          }, 3000)
        }
        return
      case 'link_countdown':
        // 倒计时用户点击立即进入或取消
        clearCountDownTime()
        if (extra?.enterNow) {
          // 立即进入
          setEngineLink(true)
          safeSetYakitStatus('link')
        } else {
          cancelCountdownLinkRef.current = true
          safeSetYakitStatus('break')
        }
        return
      default:
        return
    }
  })

  // 在 3 秒内，不断尝试让主进程取消所有正在执行的任务
  const cancelAllTasks = async () => {
    const start = Date.now()
    while (Date.now() - start < 3000) {
      let res: any = null
      try {
        res = await yakitEngine.cancelAllTasks()
      } catch (e) {
        debugToPrintLog(`------ cancel-all-tasks failed: ${e}`)
      }
      if (!res || res.canceled === 0) {
        await new Promise((r) => setTimeout(r, 300))
      } else {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

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
        safeSetYakitStatus(isInitLocalLink.current ? 'installNetWork' : 'skipAgreement_InstallNetWork')
      } finally {
        setRestartLoading(false)
      }
    }, 500)
  })

  // 数据库修复
  const [, setDbPath] = useState<string[]>([])
  const handleFixupDatabase = useMemoizedFn(async () => {
    setCheckLog(['开始修复数据库中...'])
    try {
      const res = await grpcFixupDatabase({ softwareVersion: FetchSoftwareVersion() })
      setRestartLoading(false)
      if (res.ok && res.status === 'success') {
        setCheckLog((arr) => arr.concat(['修复数据库成功']))
        safeSetYakitStatus('')
        setDbPath([])
        handleStartLocalLink(true)
        return
      }
      switch (res.status) {
        case 'timeout':
          setCheckLog((arr) => arr.concat(['命令执行超时，可查看日志详细信息...']))
          safeSetYakitStatus('fix_database_timeout')
          break
        default:
          setDbPath(res.json.path)
          setCheckLog(['修复失败，可将日志信息发送给工作人员处理...'])
          safeSetYakitStatus('fix_database_error')
      }
    } catch (error) {
      // 如果意外情况则按照修复失败处理
      outputToWelcomeConsole(`修复数据库出现意外情况：${error}`)
      setCheckLog(['修复数据库出现意外情况，可查看日志详细信息...'])
      safeSetYakitStatus('fix_database_error')
    }
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
            yakitNotify('info', `KILL yak PROCESS: ${pid}`)
          } catch (err) {
            yakitNotify('error', `Kill yak process failed: ${err}`)
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
      transitionEngineLifecycle('missing', '请选择在线安装、手工安装或远程引擎')
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
        yakitNotify('error', '远程连接已断开')
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
        setCheckLog([`解压失败：${extra?.message || '未知原因'}，请点击下载引擎继续使用...`])
        onDisconnect()
        onSetEngineMode(undefined)
        if (isInitLocalLink.current) {
          safeSetYakitStatus('installNetWork')
        } else {
          safeSetYakitStatus('skipAgreement_InstallNetWork')
        }
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
        onSetEngineMode(undefined)
        safeSetYakitStatus('skipAgreement_InstallNetWork')
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

  const handleManualInstall = useMemoizedFn(async () => {
    const selection = await handleOpenFileSystemDialog({
      title: '选择引擎文件',
      buttonLabel: '验证并安装',
      properties: ['openFile'],
      message: '引擎文件所在目录必须包含同名的 .sha256.txt 摘要文件',
    })
    if (selection.canceled || !selection.filePaths[0]) return

    setRestartLoading(true)
    try {
      transitionEngineLifecycle('verifying', '正在验证手工选择的引擎')
      await yakitEngine.installManualYakEngine(selection.filePaths[0])
      isEngineInstalled.current = true
      breakHandleRef.current = false
      safeSetYakitStatus('')
      transitionEngineLifecycle('ready-local', '手工选择的引擎已验证并安装')
      setLinkLocalEngine()
    } catch (error) {
      setCheckLog([`手工安装失败：${error}`])
      transitionEngineLifecycle('recoverable-error', '手工安装失败，原有可用版本未被删除', {
        error: `${error}`,
      })
    } finally {
      setRestartLoading(false)
    }
  })

  const startupLogo = theme === 'light' ? renyanLogoLight : renyanLogoDark

  return (
    <div className={styles['startup-wrapper']}>
      <div className={styles['startup-header-drap']} style={{ height: DragHeaderHeight }}></div>
      <div className={styles['startup-wrapper-left']}>
        <div className={styles['startup-title']}>
          <div className={styles['startup-logo']}>
            <img src={startupLogo} alt={productConfig.displayName} width={300} height={72} />
          </div>
          <div className={styles['startup-desc']}>{productConfig.tagline}</div>
        </div>
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

        {/* 工作空间选择前置步骤 */}
        {!workspaceConfirmed ? (
          <div className={styles['startup-content-wrapper']}>
            <SoftwareBasics softTheme={theme} setSoftTheme={setTheme} onConfirm={handleWorkspaceConfirmed} />
          </div>
        ) : (
          <>
            <div className={styles['startup-engine-log']} style={{ display: isRemoteEngine ? 'none' : 'block' }}>
              <EngineLog />
            </div>
            {!isRemoteEngine ? (
              <div className={styles['startup-content-wrapper']}>
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
                {!engineLink && (
                  <>
                    <EngineLifecyclePanel
                      lifecycle={engineLifecycle}
                      yakitStatus={yakitStatus}
                      logs={checkLog}
                      busy={restartLoading}
                      buildInEngineVersion={buildInEngineVersion}
                      countdown={countdown}
                      onAction={loadingClickCallback}
                      onManualInstall={handleManualInstall}
                    />
                    {/* 更新引擎 */}
                    {yaklangDownload && (
                      <DownloadYaklang
                        isTop={isTop}
                        setIsTop={setIsTop}
                        yaklangSpecifyVersion={yaklangSpecifyVersion}
                        system={system}
                        visible={yaklangDownload}
                        onCancel={onDownloadedYaklang}
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {!engineLink && (
                  <RemoteEngine
                    loading={remoteLinkLoading}
                    setLoading={setRemoteLinkLoading}
                    onSubmit={handleLinkRemoteEngine}
                    onSwitchLocalEngine={handleRemoteToLocal}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
