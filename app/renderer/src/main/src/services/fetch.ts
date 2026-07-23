import { UserInfoProps } from '@/store'
import { isCommunityEdition, globalUserLogout } from '@/utils/envfile'
import { loginOutLocal } from '@/utils/login'
import { failed } from '@/utils/notification'
import { AxiosRequestConfig, AxiosResponse } from './axios'
import { yakitNetwork } from './electronBridge'
import i18n from '@/i18n/i18n'
const tOriginal = i18n.getFixedT(null, 'utils')

let tokenExpirationHandled = false

export const isTokenExpirationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('token过期')
}

export interface AxiosResponseInfoProps {
  message?: string
  reason?: string
  userInfo?: UserInfoProps
}

export interface TokenOverdueResponse {
  code?: number
  message?: string
  userInfo?: UserInfoProps
  data?: AxiosResponseInfoProps
}

// 批量覆盖
type Merge<M, N> = Omit<M, Extract<keyof M, keyof N>> & N

export type AxiosResponseProps<T = any, D = any> = Merge<
  AxiosResponse<T, D>,
  {
    code?: number
    message?: string
  }
>

export interface requestConfig<T = any> extends AxiosRequestConfig<T> {
  params?: T
  /** @name 自定义接口域名 */
  diyHome?: string
}

export function NetWorkApi<T, D>(params: requestConfig<T>): Promise<D> {
  return new Promise((resolve, reject) => {
    // console.log("request-params", params)
    yakitNetwork
      .axiosApi(params)
      .then((res) => {
        // 埋点接口 不论结果如何 不可影响页面及交互
        if (params.url === 'tourist' && params.method === 'POST') {
          resolve('' as any)
          return
        }
        handleAxios(res, resolve, reject)
      })
      .catch((err: any) => {
        // console.log("request-err", err)
        reject(err)
      })
  })
}

const createNetworkApiError = (status: number, message: string | undefined, data: any) => {
  const serverError = data?.error
  const errorMessage = `${serverError?.message || message || `Request failed with status code ${status}`}`
  const responseData: Record<string, any> = data && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {}
  responseData.code = serverError?.code || status
  responseData.message = errorMessage
  return Object.assign(new Error(errorMessage), {
    status,
    code: serverError?.code || status,
    response: { status, data: responseData },
  })
}

export const handleAxios = (res: AxiosResponseProps<AxiosResponseInfoProps>, resolve, reject) => {
  const { code, message, data } = res
  // console.log("返回", res)
  if (!code) {
    failed(tOriginal('servicesFetch.requestTimeout'))
    reject(tOriginal('servicesFetch.requestTimeout'))
    return
  }
  if (code >= 200 && code < 300) {
    resolve(data)
    return
  }
  switch (code) {
    case 209:
      reject(data.reason)
      break
    case 401:
      tokenOverdue(res)
      reject(message)
      break
    default:
      reject((data as any)?.error ? createNetworkApiError(code, message, data) : message)
      break
  }
}

export const tokenOverdue = (res?: TokenOverdueResponse) => {
  if (isCommunityEdition()) return
  if (tokenExpirationHandled) return
  tokenExpirationHandled = true

  const userInfo = res?.userInfo || res?.data?.userInfo
  if (userInfo) loginOutLocal(userInfo)
  yakitNetwork.logoutDynamicControl({ loginOut: false })
  void globalUserLogout()
  failed(tOriginal('servicesFetch.loginExpired'))
}

export const resetTokenExpirationState = (_token?: string) => {
  tokenExpirationHandled = false
}
