import { useQuery, type UseQueryResult, useMutation } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { apiClient } from './client'

export interface Campaign {
  id: number
  name: string
  channels: string[]
  regions: string[]
  status: string
  created_by: string
  created_at: string
  workflow_count: number
  bound_channel_name?: string | null
  selected_landing_page_id?: number | null
}

export interface CampaignListData {
  total: number
  items: Campaign[]
}

interface CampaignListResponse {
  code: number
  message: string
  data: CampaignListData
}

export interface CampaignListParams {
  status?: string
  page?: number
  page_size?: number
}

export interface CampaignCreateInput {
  name: string
  created_by?: string
}

interface CampaignCreateResponse {
  code: number
  message: string
  data: Campaign
}

export interface CampaignWorkflowBrief {
  id: number
  name: string
  status: string
}

export interface CampaignChannelBinding {
  channel_id: number
  channel_name: string
  channel_code: string
  external_channel_id?: string
  token?: string
  updated_at?: string
}

export interface CampaignLandingPageSource {
  id: number
  workflow_id: number
  template_id: number
  generated_page_url: string
  language: string
}

export interface CampaignDeployedLandingPage {
  id: number
  campaign_id: number
  landing_page_id: number
  workflow_id: number
  template_id: number
  page_url: string
  package_url?: string
  channel_id?: number
  channel_external_id?: string
  generated_at: string
}

export interface CampaignDetail {
  id: number
  name: string
  channels: string[]
  regions: string[]
  status: string
  created_by: string
  created_at: string
  workflows: CampaignWorkflowBrief[]
  channel_binding?: CampaignChannelBinding | null
  landing_pages: CampaignLandingPageSource[]
  deployed_pages: CampaignDeployedLandingPage[]
  selected_landing_page_id?: number | null
}

interface CampaignDetailResponse {
  code: number
  message: string
  data: CampaignDetail
}

interface CampaignWorkflowMapRequest {
  workflow_ids: number[]
}

interface SimpleResponse {
  code: number
  message: string
  data: Record<string, unknown>
}

interface CampaignChannelBindingResponse {
  code: number
  message: string
  data: CampaignChannelBinding | null
}

interface CampaignLandingPageDeployResponse {
  code: number
  message: string
  data: CampaignDeployedLandingPage | null
}

interface CampaignLandingPageBindingResponse {
  code: number
  message: string
  data: { landing_page_id: number } | Record<string, never>
}

export interface CampaignChannel {
  id: number
  name: string
  code: string
}

export interface CampaignRegion {
  id: number
  name: string
  code: string
}

export const getCampaignChannels = async (): Promise<CampaignChannel[]> => {
  const res = await apiClient.get<CampaignChannel[]>('/campaign-channels')
  return res.data
}

export const getCampaignRegions = async (): Promise<CampaignRegion[]> => {
  const res = await apiClient.get<CampaignRegion[]>('/campaign-regions')
  return res.data
}

export const useCampaignChannels = (): UseQueryResult<
  CampaignChannel[],
  AxiosError
> =>
  useQuery<CampaignChannel[], AxiosError>({
    queryKey: ['campaign-channels'],
    queryFn: getCampaignChannels,
  })

export const useCampaignRegions = (): UseQueryResult<
  CampaignRegion[],
  AxiosError
> =>
  useQuery<CampaignRegion[], AxiosError>({
    queryKey: ['campaign-regions'],
    queryFn: getCampaignRegions,
  })

export const createCampaignChannel = async (
  payload: { name: string; code: string },
): Promise<void> => {
  const res = await apiClient.post<SimpleResponse>(
    '/campaign-channels',
    payload,
  )
  if (res.data.code !== 0) {
    throw new Error(res.data.message || '创建投放渠道失败')
  }
}

export const createCampaignRegion = async (
  payload: { name: string; code: string },
): Promise<void> => {
  const res = await apiClient.post<SimpleResponse>(
    '/campaign-regions',
    payload,
  )
  if (res.data.code !== 0) {
    throw new Error(res.data.message || '创建投放地区失败')
  }
}

export const getCampaigns = async (
  params: CampaignListParams,
): Promise<CampaignListData> => {
  const res = await apiClient.get<CampaignListResponse>('/campaigns', {
    params,
  })

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取投放计划列表失败')
  }

  return res.data.data
}

export const useCampaigns = (
  params: CampaignListParams,
): UseQueryResult<CampaignListData, AxiosError> => {
  return useQuery<CampaignListData, AxiosError>({
    queryKey: ['campaigns', params],
    queryFn: () => getCampaigns(params),
  })
}

export const createCampaign = async (
  payload: CampaignCreateInput,
): Promise<Campaign> => {
  const res = await apiClient.post<CampaignCreateResponse>(
    '/campaigns',
    payload,
  )

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '创建投放计划失败')
  }

  return res.data.data
}

export const getCampaignDetail = async (
  id: number,
): Promise<CampaignDetail> => {
  const res = await apiClient.get<CampaignDetailResponse>(`/campaigns/${id}`)
  if (res.data.code !== 0) {
    throw new Error(res.data.message || '获取投放计划详情失败')
  }
  return res.data.data
}

export const mapCampaignWorkflows = async (
  campaignId: number,
  workflowIds: number[],
): Promise<void> => {
  const res = await apiClient.post<SimpleResponse>(
    `/campaigns/${campaignId}/workflows`,
    {
      workflow_ids: workflowIds,
    } as CampaignWorkflowMapRequest,
  )

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '关联工作流失败')
  }
}

export const useCreateCampaignMutation = () =>
  useMutation({
    mutationFn: (payload: CampaignCreateInput) => createCampaign(payload),
  })

export const useMapCampaignWorkflowsMutation = () =>
  useMutation({
    mutationFn: (params: { campaignId: number; workflowIds: number[] }) =>
      mapCampaignWorkflows(params.campaignId, params.workflowIds),
  })

export const bindCampaignChannel = async (
  campaignId: number,
  payload: { channel_id: number; token?: string; external_channel_id?: string },
): Promise<CampaignChannelBinding> => {
  const res = await apiClient.post<CampaignChannelBindingResponse>(
    `/campaigns/${campaignId}/channel-binding`,
    payload,
  )

  if (res.data.code !== 0 || !res.data.data) {
    throw new Error(res.data.message || '绑定渠道失败')
  }

  return res.data.data
}

export const bindCampaignLandingPage = async (
  campaignId: number,
  landingPageId: number,
): Promise<void> => {
  const res = await apiClient.post<CampaignLandingPageBindingResponse>(
    `/campaigns/${campaignId}/landing-page-binding`,
    { landing_page_id: landingPageId },
  )

  if (res.data.code !== 0) {
    throw new Error(res.data.message || '关联落地页失败')
  }
}

export const deployCampaignLandingPage = async (
  campaignId: number,
  landingPageId: number,
): Promise<CampaignDeployedLandingPage> => {
  const res = await apiClient.post<CampaignLandingPageDeployResponse>(
    `/campaigns/${campaignId}/landing-pages/${landingPageId}/deploy`,
  )

  if (res.data.code !== 0 || !res.data.data) {
    throw new Error(res.data.message || '生成投放落地页失败')
  }

  return res.data.data
}
