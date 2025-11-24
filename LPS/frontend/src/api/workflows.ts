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

export interface Workflow {
  id: number
  name: string
  status: WorkflowStatus
  created_by: string
  created_at: string
  landing_page_count: number
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

export interface LandingPage {
  id: number
  template_id: number
  selected_video_ids: number[]
  generated_page_url: string
}

export interface WorkflowDetailData {
  id: number
  name: string
  status: WorkflowStatus
  created_by: string
  created_at: string
  updated_at: string
  landing_pages: LandingPage[]
}

export interface WorkflowDetailResponse {
  code: number
  message: string
  data: WorkflowDetailData
}

export interface WorkflowGenerateInput {
  video_ids: number[]
  template_ids: number[]
}

export interface WorkflowPreviewInput {
  video_ids: number[]
  template_id: number
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

