import React, { useEffect, useRef, useState } from 'react'
import { PluginDebugDrawerProps } from './PluginDebugDrawerType'
import { usePageInfo } from '@/store/pageInfo'
import { RuiYanButton, RuiYanDrawer } from '@/components/renyanUI'
import styles from './PluginDebugDrawer.module.scss'
import { useCreation, useMemoizedFn } from 'ahooks'
import { SolidStoreIcon } from '@/assets/icon/solid'
import emiter from '@/utils/eventBus/eventBus'
import { NucleiPluginTemplate } from '@/pages/pluginDebugger/defaultData'
import { PluginDebugBody } from '@/pages/plugins/pluginDebug/PluginDebug'
import { PluginDataProps } from '@/pages/plugins/pluginsType'
import { YakitRoute } from '@/enums/yakitRoute'
import yaml from 'js-yaml'
import { yakitNotify } from '@/utils/notification'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'

const PluginDebugDrawer: React.FC<PluginDebugDrawerProps> = React.memo((props) => {
  const { route, defaultCode, visible, setVisible } = props
  const { t } = useI18nNamespaces(['webFuzzer'])
  const [code, setCode] = useState<string>(defaultCode || NucleiPluginTemplate)

  const debuggerTypeRef = useRef('nuclei')

  useEffect(() => {
    if (defaultCode) setCode(defaultCode)
  }, [defaultCode])

  // 关闭
  const onClose = useMemoizedFn(() => {
    setVisible(false)
  })
  // 点击存为插件 跳转新建插件页面
  const handleSkipAddYakitScriptPage = useMemoizedFn(() => {
    let codeObject = {}
    try {
      codeObject = yaml.load(code)
      if (typeof codeObject !== 'object') {
        codeObject = {}
        yakitNotify('info', t('PluginDebugDrawer.noBaseInfoParsed'))
      }
    } catch (e) {
      yakitNotify('error', 'Error parsing YAML: ' + e)
    }
    emiter.emit(
      'openPage',
      JSON.stringify({
        route: YakitRoute.AddYakitScript,
        params: {
          pluginType: debuggerTypeRef.current,
          code: code,
          source: route,
          codeObject,
        },
      }),
    )
    onClose()
  })
  /**PluginDebugBody组件中使用这个plugin 主要是为了取 Type */
  const plugin: PluginDataProps = useCreation(() => {
    const info: PluginDataProps = {
      ScriptName: '',
      Type: debuggerTypeRef.current,
      Content: code,
    }
    return info
  }, [visible])
  return (
    <RuiYanDrawer
      open={Boolean(visible)}
      width={640}
      bodyClassName={styles['plugin-debugger-drawer']}
      title={t('PluginDebugDrawer.pluginDebug')}
      description="编辑当前模板并通过真实调试接口查看执行结果"
      footer={
        <>
          <RuiYanButton variant="secondary" onClick={onClose}>
            {t('YakitButton.cancel')}
          </RuiYanButton>
          <RuiYanButton onClick={handleSkipAddYakitScriptPage}>
            <SolidStoreIcon />
            {t('PluginDebugDrawer.saveAsPlugin')}
          </RuiYanButton>
        </>
      }
      onClose={onClose}
    >
      <PluginDebugBody plugin={plugin} newCode={code} setNewCode={setCode} isShowMockHTTPResponse={true} />
    </RuiYanDrawer>
  )
})

export default PluginDebugDrawer
