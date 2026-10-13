import { yakitNetwork } from './electronBridge'
import { handleAxios } from './fetch'

export const passwordApi = <T, D>(params: { url: 'urm/login' | 'urm/up/userinfo'; data: T }): Promise<D> =>
  new Promise((resolve, reject) => {
    yakitNetwork
      .passwordApi({ url: params.url, data: params.data as Record<string, unknown> })
      .then((response) => handleAxios(response, resolve, reject))
      .catch(reject)
  })
