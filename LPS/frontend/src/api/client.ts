import axios, { type AxiosError, type AxiosResponse } from 'axios'
import { getToken, clearAuthStorage } from '../utils/auth'

/**
 * 全局 axios 实例
 */
export const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  // 生成落地页时要下载 poster 并打包 zip，为了避免前端过早超时，这里先拉高超时时间
  // timeout: 100000,
})

/**
 * 请求拦截器：自动注入 token
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers = config.headers ?? {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  },
)

/**
 * 响应拦截器
 * - 文件下载（responseType = 'blob'）直接放过，由调用方自己保存
 * - 401 统一清理并跳转到登录
 * - 其它异常统一抛出 Error，方便外层捕获并展示 message
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error: AxiosError) => {
    if (error.code === 'ECONNABORTED') {
      error.message = '请求超时，请稍后重试'
    } else if (!error.response) {
      error.message = '网络异常，请检查连接'
    } else if (error.response?.status === 401) {
      clearAuthStorage()
      const current = window.location.pathname + window.location.search
      if (!current.startsWith('/login')) {
        window.location.href = `/login?redirect=${encodeURIComponent(current)}`
      }
    } else if (
      error.response.data &&
      typeof (error.response.data as any).message === 'string'
    ) {
      error.message = (error.response.data as any).message
    }

    return Promise.reject(error)
  },
)
