import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { apiClient } from './client'

export interface Channel {
  id: number
  name: string
  channel_code: string
}

export interface ChannelListData {
  items: Channel[]
}

interface ChannelListResponse {
  code: number
  message: string
  data: ChannelListData
}

export const getChannels = async (): Promise<ChannelListData> => {
  const res = await apiClient.get<ChannelListResponse>('/channels')

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取渠道列表失败')
  }

  return res.data.data
}

interface ChannelSyncResponse {
  code: number
  message: string
  data: Record<string, unknown>
}

export const syncChannels = async (): Promise<void> => {
  const res = await apiClient.post<ChannelSyncResponse>('/channels/sync')

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '同步渠道失败')
  }
}

export const useChannels = (): UseQueryResult<ChannelListData, AxiosError> => {
  return useQuery<ChannelListData, AxiosError>({
    queryKey: ['channels'],
    queryFn: getChannels,
  })
}

export interface ChannelTokenData {
  channel_id: number
  channel_code: string
  token: string
  external_channel_id?: string | null
}

interface ChannelTokenResponse {
  code: number
  message: string
  data: ChannelTokenData | null
}

export const fetchChannelToken = async (
  channelId: number,
): Promise<ChannelTokenData> => {
  const res = await apiClient.post<ChannelTokenResponse>(
    `/channels/${channelId}/token`,
  )

  if (!res.data.data) {
    throw new Error(res.data.message || '查询渠道 token 失败')
  }

  return res.data.data
}
