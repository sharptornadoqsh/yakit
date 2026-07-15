import React, { useEffect, useState } from 'react'
import { info } from '@/utils/notification'
import { Spin } from 'antd'
import LicensePage from './LicensePage'
import { ConfigPrivateDomain } from '@/components/ConfigPrivateDomain/ConfigPrivateDomain'
import { getRemoteValue, setRemoteValue } from '@/utils/kv'
import { isEnpriTrace, isEnpriTraceAgent } from '@/utils/envfile'
import { useUploadInfoByEnpriTrace } from '@/components/layout/utils'
import { JSONParseLog } from '@/utils/tool'
import { SystemInfo } from '@/constants/hardware'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { productConfig } from '@/config/product'
import productIcon from '@/assets/renyan-icon.svg'
import { OutlineMoonIcon, OutlineSunIcon } from '@/assets/icon/outline'
import { YakitRadioButtons } from '@/components/yakitUI/YakitRadioButtons/YakitRadioButtons'
import { Theme, useTheme } from '@/hook/useTheme'
import styles from './EnterpriseJudgeLogin.module.scss'
const { ipcRenderer } = window.require('electron')

/** 构建期配置：默认需要 License 验证；CI 可设为 false 跳过校验流程 */
const requireEnterpriseLicense = process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE !== 'false'

export interface EnterpriseJudgeLoginProps {
  setJudgeLicense: (v: boolean) => void
  setJudgeLogin: (v: boolean) => void
}
const EnterpriseJudgeLogin: React.FC<EnterpriseJudgeLoginProps> = (props) => {
  const { t } = useI18nNamespaces(['core'])
  const { setJudgeLicense, setJudgeLogin } = props
  const { theme, setTheme } = useTheme()
  // License
  // const [licenseVerified, setLicenseVerified] = useState<boolean>(false)
  const [activateLicense, setActivateLicense] = useState<boolean>(!requireEnterpriseLicense || !!SystemInfo.isDev)
  const [loading, setLoading] = useState<boolean>(requireEnterpriseLicense)
  const [licensePageLoading, setLicensePageLoading] = useState<boolean>(false)
  useEffect(() => {
    if (!requireEnterpriseLicense) {
      return
    }
    // 验证License
    judgeLicense()
  }, [])
  const [uploadProjectEvent] = useUploadInfoByEnpriTrace()
  const judgeLogin = () => {
    ipcRenderer
      .invoke('get-login-user-info', {})
      .then((e) => {
        if (e?.isLogin) {
          uploadProjectEvent.startUpload({
            isUploadSyncData: true,
          })
          setJudgeLogin(true)
          setJudgeLicense(false)
        } else {
          setJudgeLogin(false)
        }
      })
      .finally(() => {
        setLoading(false)
        setLicensePageLoading(false)
      })
  }

  const judgeLicense = (license?: string) => {
    if (license?.length) {
      judgeLicenseGrpc(license)
    } else {
      getRemoteValue('LICENSE_ACTIVATION').then((setting) => {
        if (!setting) {
          setLoading(false)
          return
        }
        const licenseActivation = JSONParseLog(setting, { page: 'EnterpriseJudgeLogin' })
        judgeLicenseGrpc(licenseActivation, true)
      })
    }
  }

  const judgeLicenseGrpc = (LicenseActivation: string, isCache = false) => {
    ipcRenderer
      .invoke('CheckLicense', {
        LicenseActivation,
        CompanyVersion: isEnpriTraceAgent() ? 'EnpriTraceAgent' : 'EnpriTrace',
      })
      .then((e) => {
        setActivateLicense(true)
        setRemoteValue('LICENSE_ACTIVATION', JSON.stringify(LicenseActivation))
        if (isCache) {
          judgeLogin()
        }
      })
      .catch((e) => {
        info(t('EnterpriseJudgeLogin.reActivateNotice'))
        setLoading(false)
        setLicensePageLoading(false)
      })
      .finally(() => {
        if (!isCache) {
          setLoading(false)
          setLicensePageLoading(false)
        }
      })
  }
  if (loading) {
    return (
      <main className={styles['enterprise-login-page']}>
        <div className={styles['ambient-grid']} aria-hidden="true" />
        <div className={styles['license-loading']} role="status">
          <img src={productIcon} alt={productConfig.displayName} />
          <Spin tip={t('EnterpriseJudgeLogin.verifyingLicense')} />
          <p>{t('EnterpriseJudgeLogin.verifyingDescription')}</p>
        </div>
      </main>
    )
  }

  if (!activateLicense) {
    return (
      <LicensePage
        judgeLicense={judgeLicense}
        licensePageLoading={licensePageLoading}
        setLicensePageLoading={setLicensePageLoading}
      />
    )
  }

  return (
    <main className={styles['enterprise-login-page']} data-testid="enterprise-login-page">
      <div className={styles['ambient-grid']} aria-hidden="true" />
      <div className={styles['ambient-glow']} aria-hidden="true" />

      <section className={styles['login-shell']} aria-labelledby="enterprise-login-title">
        <aside className={styles['brand-panel']}>
          <div className={styles['brand-grid']} aria-hidden="true" />
          <div className={styles['brand-orbit']} aria-hidden="true">
            <span />
          </div>

          <div className={styles['brand-identity']}>
            <div className={styles['brand-mark']}>
              <img src={productIcon} alt="" />
            </div>
            <div>
              <strong>{productConfig.displayName}</strong>
              <span>{t('EnterpriseJudgeLogin.enterpriseEdition')}</span>
            </div>
          </div>

          <div className={styles['brand-copy']}>
            <span className={styles['brand-eyebrow']}>{t('EnterpriseJudgeLogin.brandEyebrow')}</span>
            <h1>{t('EnterpriseJudgeLogin.brandHeadline')}</h1>
            <p>{t('EnterpriseJudgeLogin.brandDescription')}</p>
          </div>

          <ul className={styles['capability-list']} aria-label={t('EnterpriseJudgeLogin.capabilityLabel')}>
            <li>
              <span>01</span>
              <strong>{t('EnterpriseJudgeLogin.privateDeployment')}</strong>
            </li>
            <li>
              <span>02</span>
              <strong>{t('EnterpriseJudgeLogin.identityAccess')}</strong>
            </li>
            <li>
              <span>03</span>
              <strong>{t('EnterpriseJudgeLogin.localDataBoundary')}</strong>
            </li>
          </ul>

          <div className={styles['brand-footer']}>
            <span className={styles['pulse-dot']} />
            {t('EnterpriseJudgeLogin.controlledAccess')}
          </div>
        </aside>

        <section className={styles['form-panel']}>
          <div className={styles['form-topline']}>
            <span>{t('EnterpriseJudgeLogin.accessPortal')}</span>
            <div className={styles['form-options']}>
              <span className={styles['environment-chip']}>{t('EnterpriseJudgeLogin.privateEnvironment')}</span>
              <div className={styles['theme-switch']}>
                <span className={styles['theme-label']}>{t('EnterpriseJudgeLogin.themeLabel')}</span>
                <YakitRadioButtons
                  aria-label={t('EnterpriseJudgeLogin.themeLabel')}
                  buttonStyle="solid"
                  size="small"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as Theme)}
                  options={[
                    {
                      value: 'light',
                      label: (
                        <span className={styles['theme-option']}>
                          <OutlineSunIcon />
                          {t('EnterpriseJudgeLogin.lightTheme')}
                        </span>
                      ),
                    },
                    {
                      value: 'dark',
                      label: (
                        <span className={styles['theme-option']}>
                          <OutlineMoonIcon />
                          {t('EnterpriseJudgeLogin.darkTheme')}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className={styles['form-heading']}>
            <span>{t('EnterpriseJudgeLogin.formEyebrow')}</span>
            <h2 id="enterprise-login-title">{t('EnterpriseJudgeLogin.formTitle')}</h2>
            <p>{t('EnterpriseJudgeLogin.formDescription')}</p>
          </div>

          <ConfigPrivateDomain
            enterpriseLogin={true}
            pageMode={true}
            onSuccee={() => setJudgeLicense(false)}
            skipShow={isEnpriTrace() || isEnpriTraceAgent()}
          />

          <div className={styles['form-footer']}>
            <span />
            {t('EnterpriseJudgeLogin.connectionNotice')}
          </div>
        </section>
      </section>
    </main>
  )
}
export default EnterpriseJudgeLogin
