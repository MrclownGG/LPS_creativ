import axios, { type AxiosError, type AxiosResponse } from 'axios'

/**
 * 全局 axios 实例
 *
 * 之后所有接口都通过这个实例发送，便于统一配置 baseURL、超时以及拦截器。
 */
export const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  // 生成落地页时要下载 poster 并打包 zip，为了避免前端过早超时，这里先拉高超时时间
  timeout: 100000,
})

/**
 * 请求拦截器
 *
 * 如果以后需要在请求头里附加 token / traceId，可以在这里读取 localStorage 并设置。
 * 目前只是保留结构，方便后续扩展。
 */
apiClient.interceptors.request.use(
  (config) => {
    // TODO: 未来接入登录后，可以这样注入 token：
    // const token = window.localStorage.getItem('token')
    // if (token) {
    //   config.headers = config.headers ?? {}
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  },
)

/**
 * 响应拦截器
 *
 * - 对业务接口约定的 { code, message, data } 做统一处理
 * - 文件下载（responseType = 'blob'）直接放过，由调用方自己保存
 * - 其它异常统一抛出 Error，方便外层捕获并展示 message
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // 目前各个 API 调用处都是基于 axios 默认的 response.data 去处理，
    // 因此这里直接返回整个 response，避免破坏现有调用方式。
    return response
  },
  (error: AxiosError) => {
    // axios 会把超时、断网包装成 Error，这里统一改成中文提示
    if (error.code === 'ECONNABORTED') {
      error.message = '请求超时，请稍后重试'
    } else if (!error.response) {
      error.message = '网络异常，请检查连接'
    } else if (
      error.response.data &&
      typeof (error.response.data as any).message === 'string'
    ) {
      // 如果后端返回了 message，尽量透传，方便排查
      error.message = (error.response.data as any).message
    }

    return Promise.reject(error)
  },
)
