import React, { memo, useEffect, useRef, useState } from 'react'
import { useInViewport, useMemoizedFn } from 'ahooks'
import { PluginSourceType, PluginToDetailInfo } from '../type'
import { PluginHubSourceType } from '../defaultConstant'
import { PluginHubList } from '../pluginHubList/PluginHubList'
import { PluginHubDetail, PluginHubDetailRefProps } from '../pluginHubDetail/PluginHubDetail'
import { YakitHint } from '@/components/yakitUI/YakitHint/YakitHint'
import { getRemoteValue, setRemoteValue } from '@/utils/kv'
import { RemotePluginGV } from '@/enums/plugin'
import { YakitGetOnlinePlugin } from '@/pages/mitm/MITMServerHijacking/MITMPluginLocalList'
import { registerShortcutKeyHandle, unregisterShortcutKeyHandle } from '@/utils/globalShortcutKey/utils'
import { ShortcutKeyPage } from '@/utils/globalShortcutKey/events/pageMaps'
import { YakitRoute } from '@/enums/yakitRoute'
import { RuiYanButton, RuiYanDrawer } from '@/components/renyanUI'

import '../../plugins/plugins.scss'
import styles from './PluginHub.module.scss'

// const {ipcRenderer} = window.require("electron")

const wrapperId = 'yakit-plugin-hub'

interface PluginHubProps {}

const PluginHub: React.FC<PluginHubProps> = memo((props) => {
  const {} = props
  const [active, setActive] = useState<PluginHubSourceType>()

  const wrapper = useRef<HTMLDivElement>(null)
  const [inViewport] = useInViewport(wrapper)
  useEffect(() => {
    if (inViewport) {
      registerShortcutKeyHandle(ShortcutKeyPage.PluginHub)
      return () => {
        unregisterShortcutKeyHandle(ShortcutKeyPage.PluginHub)
      }
    }
  }, [inViewport])

  useEffect(() => {
    getRemoteValue(RemotePluginGV.UpdateLocalPluginForMITMCLI).then((val) => {
      if (val !== 'true') {
        setUpdateLocalHint(true)
      }
    })
  }, [])
  const [updateLocalHint, setUpdateLocalHint] = useState<boolean>(false)
  const [allDownloadHint, setAllDownloadHint] = useState<boolean>(false)
  const updateLocalHintOK = useMemoizedFn(() => {
    setRemoteValue(RemotePluginGV.UpdateLocalPluginForMITMCLI, 'true')
    setAllDownloadHint(true)
    setUpdateLocalHint(false)
  })
  const updateLocalHintCancel = useMemoizedFn(() => {
    setRemoteValue(RemotePluginGV.UpdateLocalPluginForMITMCLI, 'true')
    setUpdateLocalHint(false)
  })

  // 主动打开插件详情页时，是否需要主动跳到指定 tab 页面
  const [autoOpenDetailTab, setAutoOpenDetailTab] = useState<string>()

  const [isDetail, setIsDetail] = useState<boolean>(false)
  const [selectedDetail, setSelectedDetail] = useState<PluginToDetailInfo>()
  const handlePluginDetail = useMemoizedFn((info: PluginToDetailInfo) => {
    setSelectedDetail(info)
    if (!isDetail) {
      setIsDetail(true)
    }
    sendPluginDetail(info)
  })

  /** ---------- 详情组件逻辑 Start ---------- */
  const detailRef = useRef<PluginHubDetailRefProps>(null)
  const sendPluginDetail = useMemoizedFn((info: PluginToDetailInfo) => {
    setTimeout(() => {
      if (detailRef && detailRef.current) {
        detailRef.current.handleSetPlugin({ ...info })
      }
    }, 50)
  })

  const onBack = useMemoizedFn(() => {
    setIsDetail(false)
  })
  const handleHiddenDetailPage = useMemoizedFn((hidden: boolean) => {
    if (hidden) onBack()
  })
  /** ---------- 详情组件逻辑 End ---------- */

  return (
    <div ref={wrapper} id={wrapperId} className={styles['yakit-plugin-hub']}>
      <section className={styles['list']} data-pane="plugin-catalog">
        <PluginHubList
          rootElementId={wrapperId}
          active={active}
          setActive={setActive}
          isDetail={false}
          toPluginDetail={handlePluginDetail}
          setHiddenDetailPage={handleHiddenDetailPage}
          setAutoOpenDetailTab={setAutoOpenDetailTab}
        />
      </section>

      <RuiYanDrawer
        open={isDetail}
        width={640}
        title="插件详情"
        description={selectedDetail?.name || '查看插件信息、执行能力与操作记录'}
        bodyClassName={styles['detail-drawer-body']}
        onClose={onBack}
        footer={
          <RuiYanButton variant="secondary" onClick={onBack}>
            关闭
          </RuiYanButton>
        }
      >
        {isDetail && (
          <PluginHubDetail
            ref={detailRef}
            rootElementId={wrapperId}
            active={active === 'team' ? undefined : (active as PluginSourceType)}
            onBack={onBack}
            embedded={true}
            autoOpenDetailTab={autoOpenDetailTab}
            setAutoOpenDetailTab={setAutoOpenDetailTab}
          />
        )}
      </RuiYanDrawer>

      {/* mitm 新增 cli 参数，需要提示用户自动更新一遍本地插件内容 */}
      <YakitHint
        getContainer={document.getElementById(wrapperId) || undefined}
        wrapClassName={styles['update-local-hint']}
        visible={updateLocalHint}
        title="更新提示"
        content="由于MITM插件参数升级，需要将插件重新下载一次方可正常使用"
        okButtonText="立即下载"
        cancelButtonText="忽略"
        onOk={updateLocalHintOK}
        onCancel={updateLocalHintCancel}
      />
      {/* 一键下载 */}
      {allDownloadHint && (
        <YakitGetOnlinePlugin
          visible={allDownloadHint}
          setVisible={() => setAllDownloadHint(false)}
          getContainer={document.getElementById(`main-operator-page-body-${YakitRoute.Plugin_Hub}`) || undefined}
        />
      )}
    </div>
  )
})

export default PluginHub
