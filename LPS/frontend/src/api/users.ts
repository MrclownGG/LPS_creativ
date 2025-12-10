import { useQuery, useMutation, type UseQueryResult } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { apiClient } from './client'

export type UserRole = 'admin' | 'operator' | 'designer'
export type UserStatus = 'active' | 'disabled'

export interface UserItem {
  id: number
  username: string
  nickname?: string | null
  role: UserRole | string
  status: UserStatus | string
  created_at: string
}

export interface UserListData {
  total: number
  items: UserItem[]
}

interface UserListResponse {
  code: number
  message: string
  data: UserListData
}

export interface UserCreateInput {
  username: string
  password: string
  nickname?: string
  role?: UserRole
  status?: UserStatus
}

export interface UserUpdateInput {
  nickname?: string | null
  role?: UserRole
  status?: UserStatus
  password?: string
}

interface UserMutationResponse {
  code: number
  message: string
  data: { user?: UserItem }
}

export const fetchUsers = async (
  params: { page?: number; page_size?: number; status?: string; role?: string },
): Promise<UserListData> => {
  const res = await apiClient.get<UserListResponse>('/users', { params })
  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取用户列表失败')
  }
  return res.data.data
}

export const useUsers = (
  params: { page?: number; page_size?: number; status?: string; role?: string },
): UseQueryResult<UserListData, AxiosError> =>
  useQuery<UserListData, AxiosError>({
    queryKey: ['users', params],
    queryFn: () => fetchUsers(params),
  })

export const createUser = async (payload: UserCreateInput): Promise<UserItem> => {
  const res = await apiClient.post<UserMutationResponse>('/users', payload)
  if (res.data.code !== 0 || !res.data.data.user) {
    throw new Error(res.data.message || '创建用户失败')
  }
  return res.data.data.user
}

export const updateUser = async (
  userId: number,
  payload: UserUpdateInput,
): Promise<UserItem> => {
  const res = await apiClient.patch<UserMutationResponse>(`/users/${userId}`, payload)
  if (res.data.code !== 0 || !res.data.data.user) {
    throw new Error(res.data.message || '更新用户失败')
  }
  return res.data.data.user
}

export const useCreateUserMutation = () =>
  useMutation({
    mutationFn: createUser,
  })

export const useUpdateUserMutation = () =>
  useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserUpdateInput }) =>
      updateUser(id, payload),
  })
