import React, { useEffect, useState, useRef } from 'react'
import { Form, Tooltip } from 'antd'
import './ConfigPrivateDomain.scss'
import { NetWorkApi } from '@/services/fetch'
import { failed, success } from '@/utils/notification'
import { loginOut } from '@/utils/login'
import { useMemoizedFn, useGetState } from 'ahooks'
import { getRemoteValue, setRemoteValue } from '@/utils/kv'
import { useStore } from '@/store'
import productIcon from '@/assets/renyan-icon.svg'
import { API } from '@/services/swagger/resposeType'
import { YakitButton } from '../yakitUI/YakitButton/YakitButton'
import { YakitAutoComplete, defYakitAutoCompleteRef } from '../yakitUI/YakitAutoComplete/YakitAutoComplete'
import { YakitInput } from '../yakitUI/YakitInput/YakitInput'
import { InformationCircleIcon } from '@/assets/newIcon'
import { CacheDropDownGV } from '@/yakitGV'
import emiter from '@/utils/eventBus/eventBus'
import { YakitAutoCompleteRefProps } from '../yakitUI/YakitAutoComplete/YakitAutoCompleteType'
import { getRemoteConfigBaseUrlGV, getRemoteHttpSettingGV, isEnpriTrace } from '@/utils/envfile'
import { apiSystemConfig, useUploadInfoByEnpriTrace } from '../layout/utils'
import { JSONParseLog, shouldWarnAboutRemoteHttpUrl } from '@/utils/tool'
import { yakitAuth, yakitCodec, yakitProfile, yakitUILayout } from '@/services/electronBridge'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import useAIGlobalConfig from '@/pages/ai-re-act/hooks/useAIGlobalConfig'
import { YakitAlert } from '../yakitUI/YakitAlert/YakitAlert'
import { isStrongPassword } from '@/utils/passwordPolicy'

interface OnlineProfileProps {
  BaseUrl: string
  Proxy: string
  user_name: string
  pwd: string
}

const layout = {
  labelCol: { span: 7 },
  wrapperCol: { span: 17 },
}

interface ConfigPrivateDomainProps {
  onClose?: () => void
  onSuccee?: () => void
  // 是否为企业登录
  enterpriseLogin?: boolean | undefined
  // 是否使用企业登录页专用布局
  pageMode?: boolean
  // 是否展示跳过
  skipShow?: boolean
}

export const ConfigPrivateDomain: React.FC<ConfigPrivateDomainProps> = React.memo((props) => {
  const { onClose, onSuccee, enterpriseLogin = false, pageMode = false, skipShow = false } = props
  const { t } = useI18nNamespaces(['components', 'yakitUi'])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState<boolean>(false)
  const httpHistoryRef: React.MutableRefObject<YakitAutoCompleteRefProps> = useRef<YakitAutoCompleteRefProps>({
    ...defYakitAutoCompleteRef,
  })
  const [defaultHttpUrl, setDefaultHttpUrl] = useState<string>('')
  const httpProxyRef: React.MutableRefObject<YakitAutoCompleteRefProps> = useRef<YakitAutoCompleteRefProps>({
    ...defYakitAutoCompleteRef,
  })
  const [formValue, setFormValue, getFormValue] = useGetState<OnlineProfileProps>({
    BaseUrl: '',
    Proxy: '',
    user_name: '',
    pwd: '',
  })
  const [isShowSkip, setShowSkip] = useState<boolean>(false)
  useEffect(() => {
    getHttpSetting()
  }, [])
  // 全局监听登录状态
  const { userInfo, setStoreUserInfo } = useStore()

  const syncLoginOut = async () => {
    try {
      await loginOut(userInfo)
    } catch (error) {}
  }
  // 企业登录
  const [uploadProjectEvent] = useUploadInfoByEnpriTrace()
  const [, aiGlobalConfigEvent] = useAIGlobalConfig()
  const loginUser = useMemoizedFn(async () => {
    const { user_name, pwd } = getFormValue()
    try {
      const md5Res = await yakitCodec.run({ Type: 'md5', Text: pwd, Params: [], ScriptName: '' })
      const res = await NetWorkApi<API.UrmLoginRequest, API.UserData>({
        method: 'post',
        url: 'urm/login',
        data: {
          user_name: user_name.trim(),
          pwd: md5Res.Result,
        },
      })
      const data = await yakitAuth.companySignIn({ ...res })
      const user = {
        isLogin: true,
        platform: res.from_platform,
        githubName: res.from_platform === 'github' ? res.name : null,
        githubHeadImg: res.from_platform === 'github' ? res.head_img : null,
        wechatName: res.from_platform === 'wechat' ? res.name : null,
        wechatHeadImg: res.from_platform === 'wechat' ? res.head_img : null,
        qqName: res.from_platform === 'qq' ? res.name : null,
        qqHeadImg: res.from_platform === 'qq' ? res.head_img : null,
        companyName: res.from_platform === 'company' ? res.name : null,
        companyHeadImg: res.from_platform === 'company' ? res.head_img : null,
        role: res.role,
        user_id: res.user_id,
        token: res.token,
      }
      setStoreUserInfo(user)
      let systemConfig: Awaited<ReturnType<typeof uploadProjectEvent.startUpload>>
      if (data?.next) {
        success(t('ConfigPrivateDomain.enterpriseLoginSuccess'))
        onClose && onClose()
        onSuccee && onSuccee()
        systemConfig = await uploadProjectEvent.startUpload({
          isAutoUploadProject: true,
          isUploadSyncData: true,
          isUpdateGlobalConfig: enterpriseLogin,
        })
      }
      if (systemConfig?.length) {
        await aiGlobalConfigEvent.getAIGlobalConfigAfterLogin(systemConfig)
      }
      // 首次登录强制修改密码
      if (!res.loginTime) {
        yakitAuth.requestPasswordReset()
        return
      }
      //超过设置时间 强制修改密码
      const { isOpen, content } = systemConfig?.find((item) => item.configName === 'forceChangePwd') || {}
      const days = Number(content)
      if (!isOpen || !days || !res.updatedAt || res.from_platform !== 'company') return
      if (Math.floor(Date.now() / 1000) - days * 86400 > res.updatedAt) {
        yakitAuth.requestPasswordReset()
      }
    } catch (err) {
      setTimeout(() => setLoading(false), 300)
      failed(
        t('ConfigPrivateDomain.enterpriseLoginFailed', {
          error: t('ConfigPrivateDomain.loginRequestRejected'),
        }),
      )
      if (typeof err === 'string' && skipShow && (err.includes('密码不正确') || err.includes('用户不存在'))) {
        return
      }
      setShowSkip(true)
    } finally {
      form.setFieldsValue({ pwd: '' })
      setFormValue({ ...getFormValue(), pwd: '' })
    }
  })

  const onFinish = useMemoizedFn((v: OnlineProfileProps) => {
    setLoading(true)
    const BaseUrl = v.BaseUrl.endsWith('/') ? v.BaseUrl.slice(0, -1) : v.BaseUrl
    const values = {
      ...formValue,
      ...v,
      IsCompany: enterpriseLogin,
      BaseUrl,
    }
    const persistedValues = {
      BaseUrl: values.BaseUrl,
      Proxy: values.Proxy,
      user_name: values.user_name,
      IsCompany: values.IsCompany,
    }
    yakitProfile
      .setOnlineProfile({
        BaseUrl: persistedValues.BaseUrl,
        Proxy: persistedValues.Proxy,
        IsCompany: persistedValues.IsCompany,
        Password: '',
      })
      .then(() => {
        addHttpHistoryList(values.BaseUrl)
        addProxyList(values.Proxy)
        setFormValue(values)
        if (!enterpriseLogin) {
          yakitUILayout.requestSignOut()
          success(t('ConfigPrivateDomain.privateDomainSetSuccess'))
          syncLoginOut()
          onClose && onClose()
        }
        yakitAuth.editBaseUrl(values.BaseUrl).catch((err) => {
          failed(t('ConfigPrivateDomain.privateDomainSetFailed', { error: String(err) }))
          setShowSkip(true)
        })
        setRemoteValue(getRemoteHttpSettingGV(), JSON.stringify(persistedValues))

        uploadProjectEvent
          .startUpload({
            isAutoUploadProject: true,
            isUpdateGlobalConfig: enterpriseLogin,
          })
          .then(async (systemConfig) => {
            if (systemConfig?.length) {
              await aiGlobalConfigEvent.getAIGlobalConfigAfterLogin(systemConfig)
            }
          })
      })
      .catch((e: any) => {
        // !enterpriseLogin && setTimeout(() => setLoading(false), 300)
        failed(t('ConfigPrivateDomain.privateDomainSetFailed', { error: String(e) }))
      })
      .finally(() => {
        setTimeout(() => setLoading(false), 300)
      })
  })
  useEffect(() => {
    const cleanup = yakitAuth.onBaseUrlStatus(() => {
      enterpriseLogin && loginUser()
      emiter.emit('onSwitchPrivateDomain', '') // 修改私有域成功后发送的信号
    })
    return () => {
      cleanup()
    }
  }, [])
  const addHttpHistoryList = useMemoizedFn((url) => {
    httpHistoryRef.current.onSetRemoteValues(url)
  })
  const getHttpSetting = useMemoizedFn(() => {
    getRemoteValue(getRemoteHttpSettingGV()).then((setting) => {
      if (!setting) return
      const value = JSONParseLog(setting, { page: 'ConfigPrivateDomain', fun: 'getHttpSetting' })
      const { pwd: storedPassword, ...safeValue } = value
      setDefaultHttpUrl(safeValue.BaseUrl)
      if (storedPassword) {
        setRemoteValue(getRemoteHttpSettingGV(), JSON.stringify(safeValue))
      }
      form.setFieldsValue(safeValue)
      setFormValue({ ...safeValue, pwd: '' })
    })
  })
  /**@description 增加代理list历史 */
  const addProxyList = useMemoizedFn((url) => {
    httpProxyRef.current.onSetRemoteValues(url)
  })
  // 判断输入内容是否通过
  const judgePass = () => [
    {
      validator: (_, value) => {
        if (isStrongPassword(value)) {
          return Promise.resolve()
        } else {
          return Promise.reject(t('ConfigPrivateDomain.passwordRules'))
        }
      },
    },
  ]
  // 判断是否为网址
  const judgeUrl = () => [
    {
      validator: (_, value) => {
        if (/\s/.test(value)) {
          return Promise.reject(t('ConfigPrivateDomain.privateDomainHasSpace'))
        }
        try {
          const parsed = new URL(value)
          if (['http:', 'https:'].includes(parsed.protocol) && parsed.hostname) return Promise.resolve()
        } catch (error) {
          return Promise.reject(t('ConfigPrivateDomain.enterValidPrivateDomain'))
        }
        return Promise.reject(t('ConfigPrivateDomain.enterValidPrivateDomain'))
      },
    },
  ]
  return (
    <div className={`private-domain${pageMode ? ' private-domain-enterprise-page' : ''}`}>
      {enterpriseLogin && !pageMode && (
        <div className="login-title-show">
          <div className="icon-box">
            <img src={productIcon} className="type-icon-img" alt="" />
          </div>
          <div className="title-box">{t('ConfigPrivateDomain.enterpriseLogin')}</div>
        </div>
      )}
      <Form
        {...(pageMode ? { layout: 'vertical' as const } : layout)}
        form={form}
        name="control-hooks"
        onFinish={(v) => onFinish(v)}
        size={pageMode ? 'middle' : 'small'}
      >
        <Form.Item
          name="BaseUrl"
          label={t('ConfigPrivateDomain.privateDomainAddress')}
          rules={[{ required: true, message: t('YakitForm.requiredField') }, ...judgeUrl()]}
        >
          <YakitAutoComplete
            ref={httpHistoryRef}
            cacheHistoryDataKey={getRemoteConfigBaseUrlGV()}
            initValue={defaultHttpUrl}
            placeholder={t('ConfigPrivateDomain.enterPrivateDomain')}
            defaultOpen={!enterpriseLogin}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous.BaseUrl !== current.BaseUrl}>
          {({ getFieldValue }) => {
            const baseUrl = `${getFieldValue('BaseUrl') || ''}`.trim()
            if (!baseUrl.toLowerCase().startsWith('http://')) return null
            if (!pageMode) {
              return <YakitAlert type="warning" showIcon description={t('ConfigPrivateDomain.httpTransportWarning')} />
            }
            if (!shouldWarnAboutRemoteHttpUrl(baseUrl)) return null

            return (
              <div className="http-transport-hint" role="status">
                <InformationCircleIcon className="http-transport-hint-icon" />
                <span>{t('ConfigPrivateDomain.remoteHttpTransportHint')}</span>
              </div>
            )
          }}
        </Form.Item>
        {!enterpriseLogin && (
          <Form.Item
            name="Proxy"
            label={
              <span className="form-label">
                {t('ConfigPrivateDomain.setProxy')}
                <Tooltip title={t('ConfigPrivateDomain.proxyHelp')} overlayStyle={{ width: 150 }}>
                  <InformationCircleIcon className="info-icon" />
                </Tooltip>
              </span>
            }
          >
            <YakitAutoComplete
              ref={httpProxyRef}
              cacheHistoryDataKey={CacheDropDownGV.ConfigProxy}
              placeholder={t('ConfigPrivateDomain.setProxy')}
            />
          </Form.Item>
        )}
        {enterpriseLogin && (
          <Form.Item
            name="user_name"
            label={t('ConfigPrivateDomain.username')}
            rules={[{ required: true, message: t('YakitForm.requiredField') }]}
          >
            <YakitInput
              placeholder={t('ConfigPrivateDomain.enterUsername')}
              allowClear={!pageMode}
              autoComplete="username"
            />
          </Form.Item>
        )}
        {enterpriseLogin && (
          <Form.Item
            name="pwd"
            label={t('ConfigPrivateDomain.password')}
            rules={[{ required: true, message: t('YakitForm.requiredField') }, ...judgePass()]}
          >
            <YakitInput.Password
              placeholder={t('ConfigPrivateDomain.enterPassword')}
              allowClear={!pageMode}
              autoComplete="current-password"
            />
          </Form.Item>
        )}
        {enterpriseLogin ? (
          <Form.Item label={pageMode ? undefined : ' '} colon={false} className="form-item-submit">
            {pageMode ? (
              <div className="enterprise-login-actions">
                <YakitButton
                  className="enterprise-login-submit"
                  size="large"
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                >
                  {t('YakitButton.login')}
                </YakitButton>
                {isShowSkip && (
                  <YakitButton
                    className="enterprise-login-skip"
                    type="text"
                    onClick={() => {
                      onSuccee && onSuccee()
                    }}
                    size="large"
                  >
                    {t('ConfigPrivateDomain.enterLocalWorkspace')}
                  </YakitButton>
                )}
              </div>
            ) : (
              <>
                {isShowSkip && (
                  <YakitButton
                    style={{ width: 165, marginRight: 12 }}
                    onClick={() => {
                      onSuccee && onSuccee()
                    }}
                    size="large"
                  >
                    {t('YakitButton.skip')}
                  </YakitButton>
                )}
                <YakitButton
                  size="large"
                  type="primary"
                  htmlType="submit"
                  style={{ width: 165, marginLeft: isShowSkip ? 0 : 43 }}
                  loading={loading}
                >
                  {t('YakitButton.login')}
                </YakitButton>
              </>
            )}
          </Form.Item>
        ) : (
          <div className="form-btns">
            <YakitButton type="outline2" onClick={(e) => onClose && onClose()}>
              {t('YakitButton.cancel')}
            </YakitButton>
            <YakitButton type="primary" htmlType="submit" loading={loading}>
              {t('YakitButton.ok')}
            </YakitButton>
          </div>
        )}
      </Form>
    </div>
  )
})
