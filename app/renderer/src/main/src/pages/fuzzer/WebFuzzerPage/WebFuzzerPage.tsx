import React, { useEffect, useRef, useState } from 'react'
import { WebFuzzerPageProps, WebFuzzerType } from './WebFuzzerPageType'
import styles from './WebFuzzerPage.module.scss'
import {
  OutlineAdjustmentsIcon,
  OutlineBotIcon,
  OutlineClipboardlistIcon,
  OutlineCollectionIcon,
  OutlineLightningboltIcon,
  OutlineViewboardsIcon,
  OutlineBookopenIcon,
} from '@/assets/icon/outline'
import { useInViewport, useMemoizedFn } from 'ahooks'
import { YakitRoute } from '@/enums/yakitRoute'
import 'video-react/dist/video-react.css' // import css
import { PageNodeItemProps, usePageInfo } from '@/store/pageInfo'
import { shallow } from 'zustand/shallow'
import emiter from '@/utils/eventBus/eventBus'
import { getRemoteValue } from '@/utils/kv'
import { AdvancedConfigShowProps } from '../HTTPFuzzerPage'

import cloneDeep from 'lodash/cloneDeep'
import { defaultWebFuzzerPageInfo, defaultAdvancedConfigShow } from '@/defaultConstants/HTTPFuzzerPage'
import { FuzzerRemoteGV } from '@/enums/fuzzer'
import ShortcutKeyFocusHook from '@/utils/globalShortcutKey/shortcutKeyFocusHook/ShortcutKeyFocusHook'
import { TFunction, useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { useFuzzerSequence } from '@/store/fuzzerSequence'
import { JSONParseLog } from '@/utils/tool'
import { RuiYanButton, RuiYanDrawer } from '@/components/renyanUI'
const { ipcRenderer } = window.require('electron')

export const webFuzzerTabs = (t: TFunction) => {
  return [
    {
      key: 'config',
      label: t('WebFuzzerPage.config'),
      icon: <OutlineAdjustmentsIcon />,
    },
    {
      key: 'rule',
      label: t('WebFuzzerPage.rule'),
      icon: <OutlineClipboardlistIcon />,
    },
    {
      key: 'hot-patch',
      label: t('HTTPFuzzerPage.hotReload'),
      icon: <OutlineLightningboltIcon />,
    },
    {
      key: 'api-doc',
      label: t('HTTPFuzzerPage.apiDoc'),
      icon: <OutlineBookopenIcon />,
    },
    {
      key: 'ai',
      label: t('WebFuzzerPage.AI'),
      icon: <OutlineBotIcon />,
    },
    {
      key: 'sequence',
      label: t('WebFuzzerPage.sequence'),
      icon: <OutlineCollectionIcon />,
    },
    {
      key: 'concurrency',
      label: t('WebFuzzerPage.concurrency'),
      icon: <OutlineViewboardsIcon />,
    },
  ]
}
/**包裹 配置\规则\热加载\AI，不包裹序列 */
const WebFuzzerPage: React.FC<WebFuzzerPageProps> = React.memo((props) => {
  const { id } = props
  const { t, i18n } = useI18nNamespaces(['webFuzzer', 'yakitUi'])
  const { queryPagesDataById, selectGroupId, getPagesDataByGroupId } = usePageInfo(
    (s) => ({
      queryPagesDataById: s.queryPagesDataById,
      selectGroupId: s.selectGroupId.get(YakitRoute.HTTPFuzzer) || '',
      getPagesDataByGroupId: s.getPagesDataByGroupId,
    }),
    shallow,
  )
  const initWebFuzzerPageInfo = useMemoizedFn(() => {
    if (!id) {
      return cloneDeep(defaultWebFuzzerPageInfo)
    }
    const currentItem: PageNodeItemProps | undefined = queryPagesDataById(YakitRoute.HTTPFuzzer, id)
    if (currentItem && currentItem.pageParamsInfo.webFuzzerPageInfo) {
      return currentItem.pageParamsInfo.webFuzzerPageInfo
    } else {
      return cloneDeep(defaultWebFuzzerPageInfo)
    }
  })

  const webFuzzerRef = useRef<any>(null)
  const [inViewport] = useInViewport(webFuzzerRef)
  const [type, setType] = useState<WebFuzzerType>(props.defaultType || 'config')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // 高级配置的隐藏/显示
  const [advancedConfigShow, setAdvancedConfigShow] = useState<AdvancedConfigShowProps>({
    ...defaultAdvancedConfigShow,
  })

  const { fuzzerSequenceList, addFuzzerSequenceList } = useFuzzerSequence(
    (s) => ({
      fuzzerSequenceList: s.fuzzerSequenceList,
      addFuzzerSequenceList: s.addFuzzerSequenceList,
    }),
    shallow,
  )

  useEffect(() => {
    emiter.on('onGetFuzzerAdvancedConfigShow', debounceGetFuzzerAdvancedConfigShow)
    emiter.on('sequenceOrCodeSendSwitchTypeToFuzzer', onSwitchType)
    return () => {
      emiter.off('onGetFuzzerAdvancedConfigShow', debounceGetFuzzerAdvancedConfigShow)
      emiter.off('sequenceOrCodeSendSwitchTypeToFuzzer', onSwitchType)
    }
  }, [])

  useEffect(() => {
    getRemoteValue(FuzzerRemoteGV.WebFuzzerAdvancedConfigShow).then((c) => {
      if (!c) return
      try {
        const newAdvancedConfigShow = initWebFuzzerPageInfo().advancedConfigShow
        if (newAdvancedConfigShow) {
          setAdvancedConfigShow({ ...defaultAdvancedConfigShow, ...newAdvancedConfigShow })
        } else {
          const value = JSONParseLog(c, { page: 'WebFuzzerPage', fun: 'WebFuzzerAdvancedConfigShow' })
          setAdvancedConfigShow({
            ...defaultAdvancedConfigShow,
            ...value,
          })
        }
      } catch (error) {}
    })
  }, [])

  const onSetSequence = useMemoizedFn((type) => {
    const pageChildrenList: PageNodeItemProps[] = getPagesDataByGroupId(YakitRoute.HTTPFuzzer, selectGroupId) || []
    if (props.id && pageChildrenList.length === 0) {
      // 新建组
      onAddGroup({ pageId: props.id, type })
    } else {
      //这里判断SequenceList有没有当前选中组 没有就添加(解决偶发性点击序列或者并发没有反应的问题， 原因在于fuzzerSequenceList没有当前组)
      const needAddSequence = fuzzerSequenceList.every(({ groupId }) => groupId !== selectGroupId)
      needAddSequence && addFuzzerSequenceList({ groupId: selectGroupId })
      // 设置MainOperatorContent层type变化用来控制是否展示【序列】/【并发】
      emiter.emit('sendSwitchSequenceToMainOperatorContent', JSON.stringify({ type }))
    }
  })
  const onAddGroup = useMemoizedFn((params: Record<string, string>) => {
    ipcRenderer.invoke('send-add-group', params)
  })
  /**本组件中切换tab展示的事件 */
  const onSetType = useMemoizedFn((key: WebFuzzerType) => {
    switch (key) {
      case 'sequence':
      case 'concurrency':
        onSetSequence(key)
        // 当前页面不在fuzzer页面
        emiter.emit('onCurrentFuzzerPage', false)
        break
      default:
        generalEventSend(key)
        setType(key)
        break
    }
  })

  const debounceGetFuzzerAdvancedConfigShow = useMemoizedFn((data) => {
    if (inViewport) {
      try {
        const value = JSONParseLog(data, { page: 'WebFuzzerPage', fun: 'debounceGetFuzzerAdvancedConfigShow' })
        const key = value.type as WebFuzzerType
        if (['sequence', 'concurrency'].includes(key)) return
        const c = value.checked
        const newValue = {
          ...advancedConfigShow,
          [key]: c,
        }
        setAdvancedConfigShow(newValue)
      } catch (error) {}
    }
  })
  /**FuzzerSequenceWrapper组件中发送的信号或者代码层面发送，切换【配置】/【规则】/【热加载】/【AI】 */
  const onSwitchType = useMemoizedFn((data) => {
    if (!inViewport) return
    try {
      const value = JSONParseLog(data, { page: 'WebFuzzerPage', fun: 'onSwitchType' })
      const type = value.type as WebFuzzerType
      if (['sequence', 'concurrency'].includes(type)) return
      generalEventSend(type, true)
      setType(type)
    } catch (error) {}
  })
  /**通用事件发送 包括切换tab和设置高级配置的显示 */
  const generalEventSend = useMemoizedFn((key: WebFuzzerType, open?: boolean) => {
    // 设置MainOperatorContent层type变化用来控制是否展示【配置】/【规则】/【热加载】/【AI】
    emiter.emit('sendSwitchSequenceToMainOperatorContent', JSON.stringify({ type: key }))
    // 发送到HTTPFuzzerPage组件中 切换【配置】/【规则】/【热加载】/【AI】tab 得选中type
    emiter.emit('onSwitchTypeWebFuzzerPage', JSON.stringify({ type: key }))
    // 设置【配置】/【规则】/【热加载】/【AI】的高级配置的隐藏或显示
    emiter.emit('onSetAdvancedConfigShow', JSON.stringify({ type: key, open }))
    // 当前页面在fuzzer页面
    emiter.emit('onCurrentFuzzerPage', true)
  })
  return (
    <ShortcutKeyFocusHook
      className={styles['web-fuzzer']}
      boxRef={webFuzzerRef}
      focusId={props.id ? [props.id] : undefined}
      isUpdateFocus={false}
    >
      <div className={styles['web-fuzzer-toolbar']}>
        <div>
          <strong>请求与响应</strong>
          <span>低频参数统一置于高级设置</span>
        </div>
        <RuiYanButton variant="secondary" onClick={() => setAdvancedOpen(true)}>
          高级设置
        </RuiYanButton>
      </div>
      <div className={styles['web-fuzzer-tab-content']}>{props.children}</div>
      <RuiYanDrawer
        open={advancedOpen}
        title="高级设置"
        description="配置规则、热加载、接口文档、智能分析及批量执行方式"
        width={480}
        onClose={() => setAdvancedOpen(false)}
        footer={
          <RuiYanButton variant="secondary" onClick={() => setAdvancedOpen(false)}>
            关闭
          </RuiYanButton>
        }
      >
        <div className={styles['web-fuzzer-advanced-list']}>
          {webFuzzerTabs(t).map((item) => (
            <RuiYanButton
              key={item.key}
              variant={type === item.key ? 'secondary' : 'ghost'}
              icon={item.icon}
              aria-current={type === item.key ? 'page' : undefined}
              onClick={() => {
                onSetType(item.key as WebFuzzerType)
                setAdvancedOpen(false)
              }}
            >
              {item.label}
            </RuiYanButton>
          ))}
        </div>
      </RuiYanDrawer>
    </ShortcutKeyFocusHook>
  )
})

export default WebFuzzerPage
