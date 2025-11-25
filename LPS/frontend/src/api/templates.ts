import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { apiClient } from './client'

export interface Template {
  id: number
  name: string
  description?: string | null
  thumbnail_url?: string | null
  html_file_path: string
  max_videos: number
  static_assets_path?: string | null
  status: string
}

export interface TemplateListData {
  total: number
  items: Template[]
}

export interface TemplateListResponse {
  code: number
  message: string
  data: TemplateListData
}

export interface TemplateListParams {
  status?: string
  page?: number
  page_size?: number
}

export interface TemplateInput {
  name: string
  description?: string
  thumbnail_url?: string
  html_file_path: string
  max_videos: number
  static_assets_path?: string
  status?: string
}

export const getTemplates = async (
  params: TemplateListParams,
): Promise<TemplateListData> => {
  const res = await apiClient.get<TemplateListResponse>('/templates', { params })

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取模板列表失败')
  }

  return res.data.data
}

export const useTemplates = (
  params: TemplateListParams,
): UseQueryResult<TemplateListData, AxiosError> => {
  return useQuery<TemplateListData, AxiosError>({
    queryKey: ['templates', params],
    queryFn: () => getTemplates(params),
  })
}

export const createTemplate = async (
  payload: TemplateInput,
): Promise<Template> => {
  const res = await apiClient.post<{
    code: number
    message: string
    data: Template
  }>('/templates', payload)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '创建模板失败')
  }

  return res.data.data
}

export const updateTemplate = async (
  id: number,
  payload: TemplateInput,
): Promise<Template> => {
  const res = await apiClient.put<{
    code: number
    message: string
    data: Template
  }>(`/templates/${id}`, payload)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '更新模板失败')
  }

  return res.data.data
}

export const deleteTemplate = async (id: number): Promise<void> => {
  const res = await apiClient.delete<{
    code: number
    message: string
    data: Record<string, unknown>
  }>(`/templates/${id}`)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '删除模板失败')
  }
}

export const previewTemplate = async (id: number): Promise<string> => {
  const res = await apiClient.post<{
    code: number
    message: string
    data?: { preview_url: string }
  }>(`/templates/${id}/preview`)

  if (res.data.code !== 0 || !res.data.data?.preview_url) {
    throw new Error(res.data.message || '模板预览失败')
  }

  return res.data.data.preview_url
}
