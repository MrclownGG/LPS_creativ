import { apiClient } from './client'

export interface LoginInput {
  username: string
  password: string
}

export interface AuthUser {
  id: number
  username: string
  nickname?: string | null
  role?: string | null
  status?: string | null
}

export interface LoginResponseData {
  access_token: string
  token_type: string
  user: AuthUser
}

interface LoginResponse {
  code: number
  message: string
  data: LoginResponseData | null
}

interface MeResponse {
  code: number
  message: string
  data: AuthUser | null
}

export const login = async (payload: LoginInput): Promise<LoginResponseData> => {
  const res = await apiClient.post<LoginResponse>('/auth/login', payload)
  if (res.data.code !== 0 || !res.data.data) {
    throw new Error(res.data.message || '登录失败')
  }
  return res.data.data
}

export const fetchCurrentUser = async (): Promise<AuthUser> => {
  const res = await apiClient.get<MeResponse>('/auth/me')
  if (res.data.code !== 0 || !res.data.data) {
    throw new Error(res.data.message || '获取用户信息失败')
  }
  return res.data.data
}
