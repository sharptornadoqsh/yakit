import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react'
import { useMemoizedFn } from 'ahooks'
import { __PLATFORM__, FetchSoftwareVersion } from '@/utils/envfile'
import { debugToPrintLog } from '@/utils/logCollection'
import { yakitEngine } from '@/utils/electronBridge'
import { grpcCheckAllowSecretLocal } from '../../grpc'
import { assessEngineCompatibility } from '../../engineLifecycle'
import { AllowSecretLocalJson, LocalEngineProps } from './LocalEngineType'

export const LocalEngine: React.FC<LocalEngineProps> = memo(
  forwardRef((props, ref) => {
    const { setLog, onLinkEngine, yakitStatus, setYakitStatus, buildInEngineVersion, setRestartLoading } = props
    const allowSecretLocalJson = useRef<AllowSecretLocalJson>(null)
    const yakitStatusRef = useRef(yakitStatus)

    useEffect(() => {
      yakitStatusRef.current = yakitStatus
    }, [yakitStatus])

    const startYakEngine = useMemoizedFn(() => {
      if (yakitStatusRef.current === 'break' || !allowSecretLocalJson.current) return
      const { port, secret, version } = allowSecretLocalJson.current
      setLog([version ? `本地引擎 ${version} 已通过兼容能力检查` : '本地引擎已通过兼容能力检查'])
      onLinkEngine({ port, secret })
      allowSecretLocalJson.current = null
    })

    const handleAllowSecretLocal = useMemoizedFn(async (port: number) => {
      if (yakitStatusRef.current === 'break') {
        setLog([])
        return
      }

      debugToPrintLog('------ 开始执行本地引擎能力检查 ------')
      setLog(['正在检查本地引擎兼容能力...'])
      try {
        const result = await grpcCheckAllowSecretLocal({
          port,
          softwareVersion: FetchSoftwareVersion(),
          version: __PLATFORM__,
        })
        setRestartLoading(false)
        if (result.ok && result.status === 'success' && result.json) {
          const currentVersion = result.json.version || (await yakitEngine.getCurrentYak().catch(() => ''))
          const lifecycleInfo = await yakitEngine.getEngineLifecycleInfo().catch(() => undefined)
          const compatibility = assessEngineCompatibility({
            currentVersion,
            capability: 'compatible',
            minimumVersion: lifecycleInfo?.compatibility?.minimumEngineVersion,
            recommendedVersion: lifecycleInfo?.compatibility?.recommendedEngineVersion,
            highestVerifiedVersion: lifecycleInfo?.compatibility?.highestVerifiedEngineVersion,
          })
          if (compatibility.compatibility === 'incompatible') {
            allowSecretLocalJson.current = null
            setLog([
              `本地引擎 ${currentVersion || '未知版本'} 不满足兼容清单`,
              lifecycleInfo?.compatibility?.minimumEngineVersion
                ? `最低版本：${lifecycleInfo.compatibility.minimumEngineVersion}`
                : '最低版本尚未确定，请使用预置引擎或远程引擎',
            ])
            setYakitStatus('old_version')
            return
          }

          allowSecretLocalJson.current = result.json
          if (compatibility.updateAvailable) {
            setLog([
              `本地引擎 ${currentVersion} 兼容，推荐版本为 ${lifecycleInfo?.compatibility?.recommendedEngineVersion}`,
              '当前版本继续启动，主界面将在后台检查更新',
            ])
          } else if (compatibility.reason === 'above-verified-range') {
            setLog([`本地引擎 ${currentVersion} 已通过能力检查，但高于兼容清单的最高验证版本`])
          }
          setYakitStatus('')
          startYakEngine()
          return
        }

        allowSecretLocalJson.current = null
        switch (result.status) {
          case 'timeout':
          case 'call_error':
            setLog(['本地引擎能力检查超时，可重试或查看日志'])
            setYakitStatus('check_timeout')
            break
          case 'old_version':
            setLog([
              buildInEngineVersion
                ? `本地引擎不兼容，可使用预置引擎 ${buildInEngineVersion} 修复`
                : '本地引擎不兼容，请安装受支持的引擎或选择远程引擎',
            ])
            setYakitStatus('old_version')
            break
          case 'port_occupied':
            setLog(['本地端口不可用，可更换端口或终止占用进程'])
            setYakitStatus('port_occupied_prev')
            break
          case 'antivirus_blocked':
            setLog(['本地引擎被系统防护软件阻止，请查看诊断日志'])
            setYakitStatus('antivirus_blocked')
            break
          case 'database_error':
            setLog(['检测到本地数据库错误，可使用数据库修复入口'])
            setYakitStatus('database_error')
            break
          case 'build_yak_error':
          case 'dial_error':
            setLog(['本地引擎启动失败，可重试、查看日志或手工安装'])
            setYakitStatus('skipAgreement_Install')
            break
          default:
            setLog([`本地引擎能力检查失败：${result.status || '未知状态'}`, result.message || '未提供详细信息'])
            setYakitStatus('allow-secret-error')
        }
      } catch (error) {
        setRestartLoading(false)
        setLog([`本地引擎能力检查异常：${error}`])
        setYakitStatus('allow-secret-error')
      }
    })

    useEffect(() => {
      const offStartUpMessage = yakitEngine.onStartUpEngineMessage((message: string) => {
        setLog([message])
      })
      return () => offStartUpMessage()
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        init: handleAllowSecretLocal,
        checkEngine: startYakEngine,
        checkEngineSource: startYakEngine,
        startYakEngine,
        link: handleAllowSecretLocal,
      }),
      [],
    )

    return null
  }),
)
