import React, { memo, useEffect, useMemo } from 'react'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { configManagementTabType, useConfigManagementTab } from '@/store'
import { YakitRoute } from '@/enums/yakitRoute'
import emiter from '@/utils/eventBus/eventBus'
import { RuiYanLoadingState, RuiYanPanel, RuiYanTabs, type RuiYanTabItem } from '@/components/renyanUI'
import styles from './ConfigManagement.module.scss'

const NewPayload = React.lazy(() =>
  import('@/pages/payloadManager/newPayload').then((res) => ({ default: res.NewPayload })),
)
const ProxyRulesConfig = React.lazy(() => import('@/components/configNetwork/ProxyRulesConfig'))
const HotPatchManagement = React.lazy(() =>
  import('./HotPatchManagement').then((res) => ({ default: res.HotPatchManagement })),
)

const ConfigManagement: React.FC = memo(() => {
  const { t, i18n } = useI18nNamespaces(['yakitUi', 'yakitRoute', 'layout'])
  const { configManagementActiveTab, setConfigManagementActiveTab } = useConfigManagementTab()

  const tabs: RuiYanTabItem[] = useMemo(() => {
    return [
      {
        label: t('YakitRoute.Payload'),
        key: 'payload',
        content: (
          <React.Suspense fallback={<RuiYanLoadingState title="字典资源读取中" />}>
            <NewPayload />
          </React.Suspense>
        ),
      },
      {
        label: t('Layout.ExtraMenu.proxyManagement'),
        key: 'proxy',
        content: (
          <React.Suspense fallback={<RuiYanLoadingState title="代理配置读取中" />}>
            <ProxyRulesConfig />
          </React.Suspense>
        ),
      },
      {
        label: t('Layout.ExtraMenu.hotPatchManagement'),
        key: 'hotPatch',
        content: (
          <React.Suspense fallback={<RuiYanLoadingState title="热加载配置读取中" />}>
            <HotPatchManagement />
          </React.Suspense>
        ),
      },
    ]
  }, [i18n.language])

  const getCurrentTabLabel = useMemo(() => {
    switch (configManagementActiveTab) {
      case 'payload':
        return t('YakitRoute.Payload')
      case 'proxy':
        return t('Layout.ExtraMenu.proxyManagement')
      case 'hotPatch':
        return t('Layout.ExtraMenu.hotPatchManagement')
      default:
        return t('YakitRoute.configManagement')
    }
  }, [configManagementActiveTab, i18n.language])

  useEffect(() => {
    emiter.emit(
      'onUpdateSingletonPageName',
      JSON.stringify({
        route: YakitRoute.ConfigManagement,
        value: getCurrentTabLabel,
      }),
    )
  }, [configManagementActiveTab, getCurrentTabLabel])

  return (
    <div className={styles['config-management-page']}>
      <RuiYanPanel
        title="字典与代理配置"
        className={styles['config-management-panel']}
        bodyClassName={styles['config-management-content']}
      >
        <RuiYanTabs
          items={tabs}
          activeKey={configManagementActiveTab}
          onChange={(key) => setConfigManagementActiveTab(key as configManagementTabType)}
        />
      </RuiYanPanel>
    </div>
  )
})

export default ConfigManagement
