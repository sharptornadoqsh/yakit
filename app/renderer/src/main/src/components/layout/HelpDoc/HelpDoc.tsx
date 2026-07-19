import React, { useEffect, useState } from 'react'
import { YakitPopover } from '@/components/yakitUI/YakitPopover/YakitPopover'
import { YakitSystem } from '@/yakitGVDefine'
import { YakitMenu } from '@/components/yakitUI/YakitMenu/YakitMenu'
import { useMemoizedFn } from 'ahooks'
import { OutlineQuestionmarkcircleIcon } from '@/assets/icon/outline'
import { grpcFetchLocalYakitVersion, grpcFetchLocalYakVersion } from '@/apiUtils/grpc'
import { yakitShell } from '@/services/electronBridge'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { productBuild, productConfig } from '@/config/product'
import renyanLogo from '@/assets/renyan-logo-light.svg'

import classNames from 'classnames'
import styles from './HelpDoc.module.scss'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import emiter from '@/utils/eventBus/eventBus'
import { RENYAN_SHELL_EVENTS } from '@/routes/renyanMenu'
import { RuiYanButton, RuiYanModal } from '@/components/renyanUI'

interface HelpDocProps {
  system: YakitSystem
  presentation?: 'default' | 'ruiyan'
}

/** @name Yakit软件更新下载弹窗 */
export const HelpDoc: React.FC<HelpDocProps> = React.memo((props) => {
  const { system, presentation = 'default' } = props
  const { t } = useI18nNamespaces(['layout'])

  const [show, setShow] = useState<boolean>(false)
  const [aboutVisible, setAboutVisible] = useState<boolean>(false)
  const [clientVersion, setClientVersion] = useState<string>('读取中')
  const [engineVersion, setEngineVersion] = useState<string>('读取中')

  useEffect(() => {
    const openAbout = (command: string) => {
      if (command === RENYAN_SHELL_EVENTS.openAbout) setAboutVisible(true)
    }
    emiter.on('onUIOpSettingMenuSelect', openAbout)
    return () => emiter.off('onUIOpSettingMenuSelect', openAbout)
  }, [])

  useEffect(() => {
    if (!aboutVisible) return

    let active = true
    Promise.allSettled([grpcFetchLocalYakitVersion(true), grpcFetchLocalYakVersion(true)]).then(([client, engine]) => {
      if (!active) return
      setClientVersion(client.status === 'fulfilled' ? client.value || '未知' : '不可用')
      setEngineVersion(engine.status === 'fulfilled' ? engine.value || '未知' : '不可用')
    })

    return () => {
      active = false
    }
  }, [aboutVisible])

  const menu = (
    <YakitMenu
      data={[
        {
          key: 'official_website',
          label: t('HelpDoc.officialWebsite'),
        },
        {
          key: 'Github',
          label: 'Github',
          children: [
            { label: t('HelpDoc.featureRequest'), key: 'feature_request' },
            { label: 'BUG', key: 'report_bug' },
          ],
        },
        {
          key: 'aboutUs',
          label: `${t('HelpDoc.aboutUs')} · ${productConfig.shortName}`,
        },
      ]}
      onClick={({ key }) => menuSelect(key)}
    ></YakitMenu>
  )
  const menuSelect = useMemoizedFn((type: string) => {
    if (show) setShow(false)
    switch (type) {
      case 'report_bug':
        yakitShell.openExternal(`${productConfig.issuesUrl}/new?template=bug_report.yml`)
        return
      case 'feature_request':
        yakitShell.openExternal(`${productConfig.issuesUrl}/new?template=feature_request.yml`)
        return
      case 'official_website':
        yakitShell.openExternal(productConfig.repositoryUrl)
        return
      case 'aboutUs':
        setAboutVisible(true)
        return
      default:
        return
    }
  })

  const aboutContent = (
    <div className={styles['about-product']}>
      <div className={styles['about-brand']}>
        <img src={renyanLogo} alt={productConfig.displayName} />
        <div>
          <div className={styles['about-name']}>{productConfig.displayName}</div>
          <div className={styles['about-tagline']}>{productConfig.tagline}</div>
        </div>
      </div>
      <dl className={styles['about-metadata']}>
        <dt>客户端版本</dt>
        <dd>{clientVersion}</dd>
        <dt>引擎版本</dt>
        <dd>{engineVersion}</dd>
        <dt>构建版本</dt>
        <dd>{productBuild.buildSha}</dd>
        <dt>版本类别</dt>
        <dd>{productBuild.edition}</dd>
      </dl>
      <div className={styles['about-support']}>支持方：{productConfig.supportName}</div>
      <div className={styles['about-copyright']}>{productConfig.copyright}</div>
    </div>
  )

  return (
    <>
      {presentation === 'default' && (
        <YakitPopover
          overlayClassName={classNames(styles['ui-op-dropdown'], styles['ui-op-setting-dropdown'])}
          trigger={'click'}
          placement={system === 'Darwin' ? 'bottomRight' : 'bottom'}
          content={menu}
          visible={show}
          onVisibleChange={(visible) => setShow(visible)}
        >
          <div className={styles['ui-op-btn-wrapper']}>
            <div
              className={classNames(styles['op-btn-body'], {
                [styles['op-btn-body-hover']]: show,
              })}
            >
              <OutlineQuestionmarkcircleIcon className={styles['icon-style']} />
            </div>
          </div>
        </YakitPopover>
      )}
      {presentation === 'ruiyan' ? (
        <RuiYanModal
          open={aboutVisible}
          width={720}
          title={`关于 ${productConfig.displayName}`}
          onClose={() => setAboutVisible(false)}
          footer={
            <div className={styles['about-footer']}>
              <div className={styles['about-legal-links']}>
                <RuiYanButton variant="ghost" onClick={() => yakitShell.openExternal(productConfig.licenseUrl)}>
                  开源许可证
                </RuiYanButton>
                <RuiYanButton
                  variant="ghost"
                  onClick={() => yakitShell.openExternal(productConfig.thirdPartyNoticesUrl)}
                >
                  第三方通知
                </RuiYanButton>
              </div>
              <RuiYanButton onClick={() => setAboutVisible(false)}>关闭</RuiYanButton>
            </div>
          }
        >
          {aboutContent}
        </RuiYanModal>
      ) : (
        <YakitModal
          visible={aboutVisible}
          width={560}
          type="white"
          title={`关于 ${productConfig.displayName}`}
          onCancel={() => setAboutVisible(false)}
          footer={
            <div className={styles['about-footer']}>
              <div className={styles['about-legal-links']}>
                <YakitButton type="text" onClick={() => yakitShell.openExternal(productConfig.licenseUrl)}>
                  开源许可证
                </YakitButton>
                <YakitButton type="text" onClick={() => yakitShell.openExternal(productConfig.thirdPartyNoticesUrl)}>
                  第三方通知
                </YakitButton>
              </div>
              <YakitButton type="primary" onClick={() => setAboutVisible(false)}>
                关闭
              </YakitButton>
            </div>
          }
        >
          {aboutContent}
        </YakitModal>
      )}
    </>
  )
})
