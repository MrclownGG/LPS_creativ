import axios from 'axios'

/**
 * Axios 实例配置
 *
 * - baseURL 指向本地后端服务
 * - 后续所有接口调用统一从这里发出
 */
export const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  timeout: 10000,
})

