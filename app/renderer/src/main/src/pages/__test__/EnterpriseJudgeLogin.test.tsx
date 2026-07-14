import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  configPrivateDomainProps: vi.fn(),
  uploadStart: vi.fn(),
}))

vi.mock('../EnterpriseJudgeLogin.module.scss', () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}))

vi.mock('@/components/ConfigPrivateDomain/ConfigPrivateDomain', () => {
  const React = require('react')

  return {
    ConfigPrivateDomain: (props: Record<string, unknown>) => {
      testState.configPrivateDomainProps(props)
      return React.createElement('div', { 'data-testid': 'enterprise-login-form' })
    },
  }
})

vi.mock('../LicensePage', () => {
  const React = require('react')

  return {
    default: () => React.createElement('div', { 'data-testid': 'license-page' }),
  }
})

vi.mock('antd', () => {
  const React = require('react')

  return {
    Spin: ({ tip }: { tip?: React.ReactNode }) => React.createElement('div', null, tip),
  }
})

vi.mock('@/utils/notification', () => ({ info: vi.fn() }))
vi.mock('@/utils/kv', () => ({ getRemoteValue: vi.fn(), setRemoteValue: vi.fn() }))
vi.mock('@/utils/envfile', () => ({
  isEnpriTrace: () => true,
  isEnpriTraceAgent: () => false,
}))
vi.mock('@/components/layout/utils', () => ({
  useUploadInfoByEnpriTrace: () => [{ startUpload: testState.uploadStart }],
}))
vi.mock('@/utils/tool', () => ({ JSONParseLog: vi.fn() }))
vi.mock('@/constants/hardware', () => ({ SystemInfo: { isDev: false } }))
vi.mock('@/config/product', () => ({ productConfig: { displayName: '睿眼自动化渗透系统' } }))
vi.mock('@/i18n/useI18nNamespaces', () => ({
  useI18nNamespaces: () => ({
    t: (key: string) =>
      ({
        'EnterpriseJudgeLogin.enterpriseEdition': '企业安全工作台',
        'EnterpriseJudgeLogin.brandEyebrow': '统一安全验证入口',
        'EnterpriseJudgeLogin.brandHeadline': '以可信身份进入企业工作区',
        'EnterpriseJudgeLogin.brandDescription': '面向私有部署环境，统一组织流量分析、安全测试、项目与结果数据。',
        'EnterpriseJudgeLogin.capabilityLabel': '企业入口能力',
        'EnterpriseJudgeLogin.privateDeployment': '私有部署接入',
        'EnterpriseJudgeLogin.identityAccess': '企业身份认证',
        'EnterpriseJudgeLogin.localDataBoundary': '本地数据边界',
        'EnterpriseJudgeLogin.controlledAccess': '受控访问通道',
        'EnterpriseJudgeLogin.accessPortal': '企业访问门户',
        'EnterpriseJudgeLogin.privateEnvironment': '私有环境',
        'EnterpriseJudgeLogin.formEyebrow': '身份验证',
        'EnterpriseJudgeLogin.formTitle': '登录企业工作区',
        'EnterpriseJudgeLogin.formDescription': '请输入私有域地址与企业账号信息',
        'EnterpriseJudgeLogin.connectionNotice': '请连接已授权的企业服务地址',
      })[key] ?? key,
  }),
}))

let EnterpriseJudgeLogin: React.ComponentType<{
  setJudgeLicense: (value: boolean) => void
  setJudgeLogin: (value: boolean) => void
}>
const originalLicenseSetting = process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE

beforeAll(async () => {
  process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE = 'false'
  ;(window as unknown as { require: () => unknown }).require = () => ({
    ipcRenderer: { invoke: vi.fn() },
  })
  EnterpriseJudgeLogin = (await import('../EnterpriseJudgeLogin')).default
})

afterAll(() => {
  if (originalLicenseSetting === undefined) {
    delete process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE
  } else {
    process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE = originalLicenseSetting
  }
})

beforeEach(() => {
  testState.configPrivateDomainProps.mockClear()
  testState.uploadStart.mockClear()
})

describe('企业登录页面', () => {
  it('展示企业品牌信息并启用页面模式表单', () => {
    render(<EnterpriseJudgeLogin setJudgeLicense={vi.fn()} setJudgeLogin={vi.fn()} />)

    expect(screen.getByTestId('enterprise-login-page')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '以可信身份进入企业工作区' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '登录企业工作区' })).toBeInTheDocument()
    expect(screen.getByText('睿眼自动化渗透系统')).toBeInTheDocument()
    expect(screen.getByTestId('enterprise-login-form')).toBeInTheDocument()

    const formProps = testState.configPrivateDomainProps.mock.calls.at(-1)?.[0]
    expect(formProps).toMatchObject({ enterpriseLogin: true, pageMode: true, skipShow: true })
  })

  it('认证成功后退出企业登录门禁', () => {
    const setJudgeLicense = vi.fn()
    render(<EnterpriseJudgeLogin setJudgeLicense={setJudgeLicense} setJudgeLogin={vi.fn()} />)

    const formProps = testState.configPrivateDomainProps.mock.calls.at(-1)?.[0] as {
      onSuccee: () => void
    }
    act(() => formProps.onSuccee())

    expect(setJudgeLicense).toHaveBeenCalledWith(false)
  })
})
