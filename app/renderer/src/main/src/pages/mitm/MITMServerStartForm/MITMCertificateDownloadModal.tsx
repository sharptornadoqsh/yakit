import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import styles from './MITMServerStartForm.module.scss'
import { RuiYanButton, RuiYanModal } from '@/components/renyanUI'
import { YakitTag } from '@/components/yakitUI/YakitTag/YakitTag'
import { YakEditor } from '@/utils/editors'
import { CaCertData } from '../MITMServerHijacking/MITMServerHijacking'
import { useMemoizedFn } from 'ahooks'
import { saveABSFileToOpen, openExternalWebsite } from '@/utils/openWebsite'
import { YakitCard } from '@/components/yakitUI/YakitCard/YakitCard'
import { YakitRadioButtons } from '@/components/yakitUI/YakitRadioButtons/YakitRadioButtons'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { OutlineQuestionmarkcircleIcon } from '@/assets/icon/outline'

const { ipcRenderer } = window.require('electron')

interface MITMCertificateDownloadModalProps {
  visible: boolean
  setVisible: (b: boolean) => void
}
export const MITMCertificateDownloadModal: React.FC<MITMCertificateDownloadModalProps> = React.memo((props) => {
  const { visible, setVisible } = props
  const [isGMState, setIsGMState] = useState<boolean>(false) // 是否为国密证书
  const [caCerts, setCaCerts] = useState<CaCertData>({
    CaCerts: new Uint8Array(),
    LocalFile: '',
  })
  const { t, i18n } = useI18nNamespaces(['mitm', 'yakitUi'])
  useEffect(() => {
    const apiName = isGMState ? 'DownloadMITMGMCert' : 'DownloadMITMCert'
    ipcRenderer.invoke(apiName, {}).then((data: CaCertData) => {
      setCaCerts(data)
    })
  }, [isGMState])
  /**
   * @description 下载证书
   */
  const onDown = useMemoizedFn(() => {
    if (!caCerts.CaCerts) return
    const fileName = isGMState ? 'RuiYan-MITM-GM-CA.pem' : 'RuiYan-MITM-CA.pem'
    saveABSFileToOpen(fileName, caCerts.CaCerts)
  })
  return (
    <RuiYanModal
      open={visible}
      onClose={() => setVisible(false)}
      title={t('MITMCertificateDownloadModal.download_cert')}
      description="查看当前证书内容并保存到本地，代理访问说明位于操作区"
      width={720}
      bodyClassName={styles['mitm-certificate-download-modal']}
      footer={
        <>
          <div className={styles['certificate-download-modal-footer']}>
            {t('MITMCertificateDownloadModal.after_proxy_visit')}
            <YakitTag enableCopy copyText="http://mitm" iconColor="var(--Colors-Use-Main-Primary)" />
            {t('MITMCertificateDownloadModal.auto_download_cert')}
          </div>
          <RuiYanButton variant="secondary" onClick={() => setVisible(false)}>
            {t('YakitButton.cancel')}
          </RuiYanButton>
          <RuiYanButton onClick={() => onDown()}>{t('MITMCertificateDownloadModal.download_and_open')}</RuiYanButton>
        </>
      }
      closeOnBackdrop={false}
    >
      <YakitCard
        title={
          <YakitRadioButtons
            buttonStyle="solid"
            options={[
              {
                value: false,
                label: t('MITMCertificateDownloadModal.ssl_tls_cert'),
              },
              {
                value: true,
                label: t('MITMCertificateDownloadModal.gm_ssl_tls_cert'),
              },
            ]}
            value={isGMState}
            onChange={(e) => {
              setIsGMState(e.target.value)
            }}
          />
        }
        style={{ borderRadius: 4 }}
        headStyle={{ height: 36 }}
        bodyStyle={{ padding: 0 }}
        extra={
          isGMState ? (
            <YakitButton
              type="text"
              onClick={() => {
                openExternalWebsite('https://mp.weixin.qq.com/s/smGfZar2H0arbkZx_4b-Iw')
              }}
              className={styles['certificate-download-modal-btn']}
            >
              {t('YakitButton.ImportTutorial')}
              <OutlineQuestionmarkcircleIcon className={styles['certificate-download-modal-icon']} />
            </YakitButton>
          ) : null
        }
      >
        <div className={styles['certificate-download-modal-body']}>
          <YakEditor bytes={true} valueBytes={caCerts.CaCerts} />
        </div>
      </YakitCard>
    </RuiYanModal>
  )
})

export default MITMCertificateDownloadModal
