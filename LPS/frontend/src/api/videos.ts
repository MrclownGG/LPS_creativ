import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { apiClient } from './client'

// 单条视频实体
export interface Video {
  id: number
  title: string
  poster_url: string
  category?: string | null
  view_count: number
  updated_at?: string | null
}

// 列表接口响应 data 部分
export interface VideoListData {
  total: number
  items: Video[]
}

export interface VideoListResponse {
  code: number
  message: string
  data: VideoListData
}

export interface VideoListParams {
  category?: string
  page?: number
  page_size?: number
}

// 新建 / 编辑 时使用的输入字段
export interface VideoCreateInput {
  external_id?: string
  title: string
  category?: string
  poster_url: string
  view_count?: number
}

// 从外部 API 同步视频时使用的参数
export interface VideoSyncParams {
  start_date?: string
  end_date?: string
  limit?: number
}

// 从外部 API 同步视频的结果 data 部分
export interface VideoSyncData {
  imported_count: number
  updated_count: number
  source?: string
  start_date?: string
  end_date?: string
  limit?: number
}

export const uploadVideoPoster = async (
  id: number,
  file: File,
): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await apiClient.post<{
    code: number
    message: string
    data: { poster_url: string }
  }>(`/videos/${id}/poster`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  if (response.data.code !== 0) {
    throw new Error(response.data.message || '上传封面失败')
  }

  return response.data.data.poster_url
}

export const getVideos = async (
  params: VideoListParams,
): Promise<VideoListData> => {
  const response = await apiClient.get<VideoListResponse>('/videos', { params })

  if (response.data.code !== 0) {
    throw new Error(response.data.message || '获取视频列表失败')
  }

  return response.data.data
}

export const useVideos = (
  params: VideoListParams,
): UseQueryResult<VideoListData, AxiosError> => {
  return useQuery<VideoListData, AxiosError>({
    queryKey: ['videos', params],
    queryFn: () => getVideos(params),
  })
}

export const createVideo = async (
  payload: VideoCreateInput,
): Promise<Video> => {
  const response = await apiClient.post<{
    code: number
    message: string
    data: Video
  }>('/videos', payload)

  if (response.data.code !== 0) {
    throw new Error(response.data.message || '手动导入视频失败')
  }

  return response.data.data
}

export const updateVideo = async (
  id: number,
  payload: VideoCreateInput,
): Promise<Video> => {
  const response = await apiClient.put<{
    code: number
    message: string
    data: Video
  }>(`/videos/${id}`, payload)

  if (response.data.code !== 0) {
    throw new Error(response.data.message || '更新视频失败')
  }

  return response.data.data
}

export const deleteVideo = async (id: number): Promise<void> => {
  const response = await apiClient.delete<{
    code: number
    message: string
    data: Record<string, unknown>
  }>(`/videos/${id}`)

  if (response.data.code !== 0) {
    throw new Error(response.data.message || '删除视频失败')
  }
}

export const syncVideos = async (
  params: VideoSyncParams,
): Promise<VideoSyncData> => {
  const response = await apiClient.post<{
    code: number
    message: string
    data: VideoSyncData
  }>('/videos/sync', undefined, {
    params,
  })

  if (response.data.code !== 0) {
    throw new Error(response.data.message || '从 API 导入视频失败')
  }

  return response.data.data
}
