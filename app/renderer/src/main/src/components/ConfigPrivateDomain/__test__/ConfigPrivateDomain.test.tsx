import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigPrivateDomain } from '../ConfigPrivateDomain'

const mocks = vi.hoisted(() => ({
  getRemoteValue: vi.fn(),
  setRemoteValue: vi.fn(),
  setOnlineProfile: vi.fn(),
  editBaseUrl: vi.fn(),
  startUpload: vi.fn(),
}))

vi.mock('@/utils/kv', () => ({ getRemoteValue: mocks.getRemoteValue, setRemoteValue: mocks.setRemoteValue }))
vi.mock('@/utils/envfile', () => ({
  getRemoteHttpSettingGV: () => 'http-setting',
  getRemoteConfigBaseUrlGV: () => 'base-url-history',
  isEnpriTrace: () => true,
}))
vi.mock('@/i18n/useI18nNamespaces', () => ({ useI18nNamespaces: () => ({ t: (key: string) => key }) }))
vi.mock('@/utils/tool', () => ({ JSONParseLog: JSON.parse, shouldWarnAboutRemoteHttpUrl: () => false }))
vi.mock('@/utils/notification', () => ({ failed: vi.fn(), success: vi.fn(), yakitNotify: vi.fn() }))
vi.mock('@/utils/login', () => ({ loginOut: vi.fn() }))
vi.mock('@/store', () => ({ useStore: () => ({ userInfo: {}, setStoreUserInfo: vi.fn() }) }))
vi.mock('@/utils/eventBus/eventBus', () => ({ default: { emit: vi.fn() } }))
vi.mock('@/services/fetch', () => ({ NetWorkApi: vi.fn() }))
vi.mock('@/services/electronBridge', () => ({
  yakitAuth: { onBaseUrlStatus: () => vi.fn(), editBaseUrl: mocks.editBaseUrl },
  yakitCodec: {},
  yakitProfile: { setOnlineProfile: mocks.setOnlineProfile },
  yakitUILayout: { requestSignOut: vi.fn() },
}))
vi.mock('@/components/layout/utils', () => ({
  apiSystemConfig: vi.fn(),
  useUploadInfoByEnpriTrace: () => [{ startUpload: mocks.startUpload }],
}))
vi.mock('@/pages/ai-re-act/hooks/useAIGlobalConfig', () => ({
  default: () => [{}, { getAIGlobalConfigAfterLogin: vi.fn() }],
}))
vi.mock('@/assets/newIcon', () => ({ InformationCircleIcon: () => null }))
vi.mock('@/assets/icon/outline', () => ({ OutlineXIcon: () => null }))
vi.mock('@/components/yakitUI/YakitButton/YakitButton', () => ({ YakitButton: require('antd').Button }))
vi.mock('@/components/yakitUI/YakitInput/YakitInput', () => ({ YakitInput: require('antd').Input }))
vi.mock('@/components/yakitUI/YakitAlert/YakitAlert', () => ({ YakitAlert: () => null }))
vi.mock('../ConfigPrivateDomain.scss', () => ({}))
vi.mock('@/components/yakitUI/YakitAutoComplete/YakitAutoComplete.module.scss', () => ({ default: {} }))
vi.mock('ahooks', () => ({
  useGetState: require('ahooks/lib/useGetState').default,
  useMemoizedFn: require('ahooks/lib/useMemoizedFn').default,
  useInViewport: () => [true],
}))

const defaultUrl = 'https://www.yaklang.com'
const enterpriseUrl = 'https://enterprise.example.test'

const setStoredValues = (setting?: Record<string, unknown>, historyUrl = '') => {
  mocks.getRemoteValue.mockImplementation(async (key: string) => {
    if (key === 'http-setting') return setting ? JSON.stringify(setting) : ''
    if (key === 'base-url-history' && historyUrl) {
      return JSON.stringify({ defaultValue: historyUrl, options: [historyUrl] })
    }
    return ''
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setRemoteValue.mockResolvedValue(undefined)
  mocks.setOnlineProfile.mockResolvedValue(undefined)
  mocks.editBaseUrl.mockResolvedValue(undefined)
  mocks.startUpload.mockResolvedValue([])
  setStoredValues()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(cleanup)

const openServiceForm = async (enterpriseLogin = true) => {
  render(<ConfigPrivateDomain enterpriseLogin={enterpriseLogin} pageMode={enterpriseLogin} />)
  return screen.findByRole('combobox', { name: 'ConfigPrivateDomain.privateDomainAddress' })
}

const enterCredentials = () => {
  fireEvent.change(screen.getByPlaceholderText('ConfigPrivateDomain.enterUsername'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByPlaceholderText('ConfigPrivateDomain.enterPassword'), {
    target: { value: 'ExamplePass1!' },
  })
}

describe('Enterprise service address defaults', () => {
  it('starts empty without stored settings', async () => {
    expect(await openServiceForm()).toHaveValue('')
  })

  it.each([defaultUrl, `${defaultUrl}/`])('leaves an inherited public default empty: %s', async (BaseUrl) => {
    setStoredValues({ BaseUrl })
    expect(await openServiceForm()).toHaveValue('')
  })

  it.each([undefined, { BaseUrl: defaultUrl }])('does not refill from public address history: %j', async (setting) => {
    setStoredValues(setting, defaultUrl)
    expect(await openServiceForm()).toHaveValue('')
  })

  it.each([undefined, true])('refills a configured enterprise address: %s', async (IsCompany) => {
    setStoredValues({ BaseUrl: enterpriseUrl, user_name: 'admin', IsCompany }, defaultUrl)
    expect(await openServiceForm()).toHaveValue(enterpriseUrl)
    expect(screen.getByPlaceholderText('ConfigPrivateDomain.enterUsername')).toHaveValue('admin')
  })

  it('refills an explicitly saved public address', async () => {
    setStoredValues({ BaseUrl: defaultUrl, IsCompany: true }, defaultUrl)
    expect(await openServiceForm()).toHaveValue(defaultUrl)
  })

  it('retains selectable history and refills the saved address when the form opens again', async () => {
    setStoredValues({ BaseUrl: enterpriseUrl, IsCompany: true }, enterpriseUrl)
    const input = await openServiceForm()
    expect(input).toHaveValue(enterpriseUrl)
    expect(mocks.setRemoteValue).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.mouseDown(input)
    fireEvent.click(await screen.findByText(enterpriseUrl, { selector: '.ant-select-item-option-content div' }))
    expect(input).toHaveValue(enterpriseUrl)
    cleanup()
    expect(await openServiceForm()).toHaveValue(enterpriseUrl)
    expect(mocks.setRemoteValue).not.toHaveBeenCalled()
  })

  it('does not persist the blank display value when removing a legacy password', async () => {
    setStoredValues({ BaseUrl: defaultUrl, user_name: 'admin', pwd: 'ExamplePass1!' })
    expect(await openServiceForm()).toHaveValue('')
    expect(screen.getByPlaceholderText('ConfigPrivateDomain.enterPassword')).toHaveValue('')
    expect(mocks.setRemoteValue).toHaveBeenCalledWith(
      'http-setting',
      JSON.stringify({ BaseUrl: defaultUrl, user_name: 'admin' }),
    )
  })

  it('keeps the public default in the non-enterprise settings form', async () => {
    setStoredValues({ BaseUrl: defaultUrl }, defaultUrl)
    expect(await openServiceForm(false)).toHaveValue(defaultUrl)
  })

  it('rejects an empty service address before submitting', async () => {
    await openServiceForm()
    enterCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.login' }))
    expect(await screen.findByText('YakitForm.requiredField')).toBeInTheDocument()
    expect(mocks.setOnlineProfile).not.toHaveBeenCalled()
  })

  it('rejects an invalid service address before submitting', async () => {
    const input = await openServiceForm()
    enterCredentials()
    fireEvent.change(input, { target: { value: 'not-a-url' } })
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.login' }))
    expect(await screen.findByText('ConfigPrivateDomain.enterValidPrivateDomain')).toBeInTheDocument()
    expect(mocks.setOnlineProfile).not.toHaveBeenCalled()
  })

  it('saves a manually entered service address using the existing protocol', async () => {
    const input = await openServiceForm()
    enterCredentials()
    fireEvent.change(input, { target: { value: `${enterpriseUrl}/` } })
    fireEvent.click(screen.getByRole('button', { name: 'YakitButton.login' }))
    await waitFor(() =>
      expect(mocks.setOnlineProfile).toHaveBeenCalledWith({
        BaseUrl: enterpriseUrl,
        Proxy: '',
        IsCompany: true,
        Password: '',
      }),
    )
    expect(mocks.setRemoteValue).toHaveBeenCalledWith(
      'http-setting',
      JSON.stringify({ BaseUrl: enterpriseUrl, Proxy: '', user_name: 'admin', IsCompany: true }),
    )
    const persisted = mocks.setRemoteValue.mock.calls.find(([key]) => key === 'http-setting')?.[1]
    cleanup()
    setStoredValues(JSON.parse(persisted), enterpriseUrl)
    expect(await openServiceForm()).toHaveValue(enterpriseUrl)
  })
})
