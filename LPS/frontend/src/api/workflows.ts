import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { apiClient } from './client'

export type WorkflowStatus =
  | 'draft'
  | 'generating'
  | 'pending_ad'
  | 'ready'
  | 'in_use'
  | 'archived'

export type LandingPageLanguage = 'zh' | 'en' | 'pt'

export interface Workflow {
  id: number
  name: string
  status: WorkflowStatus
  created_by: string
  created_at: string
  landing_page_count: number
  ad_image_count: number
  campaign_count: number
  campaign_names: string[]
  languages?: LandingPageLanguage[]
  channel_names?: string[]
  latest_landing_page_id?: number | null
}

export interface WorkflowListData {
  total: number
  items: Workflow[]
}

export interface WorkflowListResponse {
  code: number
  message: string
  data: WorkflowListData
}

export interface WorkflowListParams {
  status?: WorkflowStatus
  page?: number
  page_size?: number
}

export interface WorkflowCreateInput {
  name: string
  created_by?: string
}

export interface WorkflowSelectedVideo {
  id: number
  title: string
  poster_url: string
}

export interface LandingPage {
  id: number
  template_id: number
  channel_id?: number
  selected_video_ids: number[]
  generated_page_url: string
  language: LandingPageLanguage
  selected_videos?: WorkflowSelectedVideo[]
  package_url?: string
}

export interface WorkflowDetailData {
  id: number
  name: string
  status: WorkflowStatus
  created_by: string
  created_at: string
  updated_at: string
  landing_pages: LandingPage[]
  ad_image_count: number
  campaign_count: number
  campaign_names: string[]
}

export interface WorkflowDetailResponse {
  code: number
  message: string
  data: WorkflowDetailData
}

export interface WorkflowAdImage {
  id: number
  file_url: string
  file_name?: string
}

interface WorkflowAdImageListResponse {
  code: number
  message: string
  data: WorkflowAdImage[]
}

interface WorkflowAdImageUploadResponse {
  code: number
  message: string
  data: WorkflowAdImage
}

export interface WorkflowGenerateInput {
  video_ids: number[]
  template_ids: number[]
  channel_id?: number
  language?: LandingPageLanguage
}

export interface WorkflowPreviewInput {
  video_ids: number[]
  template_id: number
  channel_id?: number
  language?: LandingPageLanguage
}

export const getWorkflows = async (
  params: WorkflowListParams,
): Promise<WorkflowListData> => {
  const res = await apiClient.get<WorkflowListResponse>('/workflows', {
    params,
  })

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取工作流列表失败')
  }

  return res.data.data
}

export const useWorkflows = (
  params: WorkflowListParams,
): UseQueryResult<WorkflowListData, AxiosError> => {
  return useQuery<WorkflowListData, AxiosError>({
    queryKey: ['workflows', params],
    queryFn: () => getWorkflows(params),
  })
}

export const createWorkflow = async (
  payload: WorkflowCreateInput,
): Promise<Workflow> => {
  const res = await apiClient.post<{
    code: number
    message: string
    data: Workflow
  }>('/workflows', payload)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '创建工作流失败')
  }

  return res.data.data
}

export const getWorkflowDetail = async (
  id: number,
): Promise<WorkflowDetailData> => {
  const res = await apiClient.get<WorkflowDetailResponse>(`/workflows/${id}`)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取工作流详情失败')
  }

  return res.data.data
}

export const useWorkflowDetail = (
  id?: number,
): UseQueryResult<WorkflowDetailData, AxiosError> => {
  return useQuery<WorkflowDetailData, AxiosError>({
    queryKey: ['workflow', id],
    queryFn: () => {
      if (!id) {
        throw new Error('workflow id is required')
      }
      return getWorkflowDetail(id)
    },
    enabled: !!id,
  })
}

export const getWorkflowAdImages = async (
  id: number,
): Promise<WorkflowAdImage[]> => {
  const res = await apiClient.get<WorkflowAdImageListResponse>(
    `/workflows/${id}/ad-images`,
  )
  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取广告图失败')
  }
  return res.data.data
}

export const useWorkflowAdImages = (
  id?: number,
): UseQueryResult<WorkflowAdImage[], AxiosError> => {
  return useQuery<WorkflowAdImage[], AxiosError>({
    queryKey: ['workflow-ad-images', id],
    queryFn: () => {
      if (!id) {
        throw new Error('workflow id is required')
      }
      return getWorkflowAdImages(id)
    },
    enabled: !!id,
  })
}

export const generateWorkflow = async (
  id: number,
  payload: WorkflowGenerateInput,
): Promise<WorkflowDetailData> => {
  const res = await apiClient.post<{
    code: number
    message: string
    data: {
      workflow_id: number
      landing_pages: LandingPage[]
    } | null
  }>(`/workflows/${id}/generate`, payload)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '生成落地页失败')
  }

  // 生成后再拉一次详情，保证前端数据完整
  return getWorkflowDetail(id)
}

export const deleteWorkflow = async (id: number): Promise<void> => {
  const res = await apiClient.delete<{
    code: number
    message: string
    data: Record<string, unknown>
  }>(`/workflows/${id}`)

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '删除工作流失败')
  }
}

export const previewWorkflow = async (
  payload: WorkflowPreviewInput,
): Promise<string> => {
  const res = await apiClient.post<{
    code: number
    message: string
    data: {
      preview_url: string
    } | null
  }>('/workflows/preview', payload)

  if (res.data.code !== 0 || !res.data.data) {
    throw new Error(res.data.message || '预览落地页失败')
  }

  return res.data.data.preview_url
}

export const uploadWorkflowAdImage = async (
  workflowId: number,
  file: File,
  author?: string,
): Promise<WorkflowAdImage> => {
  const formData = new FormData()
  formData.append('file', file)
  if (author) {
    formData.append('author', author)
  }

  const res = await apiClient.post<WorkflowAdImageUploadResponse>(
    `/workflows/${workflowId}/ad-images/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  )

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '上传广告图失败')
  }

  return res.data.data
}
