import { useParams } from 'react-router-dom'
import { useRef, useState, useMemo, type ChangeEvent } from 'react'
import { Card, Typography, Table, Tag, Alert, Button, Spin, App } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  useWorkflowDetail,
  useWorkflowAdImages,
  uploadWorkflowAdImage,
  type LandingPage,
  type WorkflowStatus,
  type WorkflowAdImage,
} from '../api/workflows'
import { useChannels, type Channel } from '../api/channels'
import { apiClient } from '../api/client'

const { Title, Paragraph } = Typography

const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: '草稿',
  generating: '生成中',
  pending_ad: '广告待上传',
  ready: '准备完成（待投流）',
  in_use: '已投流',
  archived: '已归档',
}

const WORKFLOW_STATUS_COLOR: Record<WorkflowStatus, string> = {
  draft: 'default',
  generating: 'processing',
  pending_ad: 'warning',
  ready: 'success',
  in_use: 'success',
  archived: 'default',
}

export const WorkflowDetailPage: React.FC = () => {
  const { message } = App.useApp()
  const params = useParams<{ workflowId: string }>()
  const workflowId = Number(params.workflowId)

  const backendBaseUrl =
    apiClient.defaults.baseURL?.replace(/\/api\/?$/, '') ||
    window.location.origin
  const apiBaseUrl = apiClient.defaults.baseURL ?? ''

  const {
    data,
    isLoading,
    error,
    refetch: refetchDetail,
  } = useWorkflowDetail(Number.isFinite(workflowId) ? workflowId : undefined)
  const {
    data: adImages,
    isLoading: adImagesLoading,
    refetch: refetchAdImages,
  } = useWorkflowAdImages(
    Number.isFinite(workflowId) ? workflowId : undefined,
  )
  const { data: channelData } = useChannels()
  const channelMap = useMemo(() => {
    const map = new Map<number, Channel>()
    ;(channelData?.items ?? []).forEach((ch) => {
      map.set(ch.id, ch)
    })
    return map
  }, [channelData])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const resolvePreviewUrl = (url?: string): string => {
    if (!url) return ''
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
      return url
    }
    if (url.startsWith('/')) {
      return `${backendBaseUrl}${url}`
    }
    return `${backendBaseUrl}/${url}`
  }

  const resolveStaticUrl = (url?: string): string => {
    if (!url) return ''
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
      return url
    }
    if (url.startsWith('/')) {
      return `${backendBaseUrl}${url}`
    }
    return `${backendBaseUrl}/${url}`
  }

  const renderLanguageTag = (lang: LandingPage['language']) => {
    const label =
      lang === 'en' ? '英文' : lang === 'pt' ? '葡萄牙语' : '中文'
    const color =
      lang === 'en' ? 'blue' : lang === 'pt' ? 'purple' : 'default'
    return <Tag color={color}>{label}</Tag>
  }

  const columns: ColumnsType<LandingPage> = [
    {
      title: 'ID / 模板 / 渠道',
      dataIndex: 'id',
      width: 260,
      render: (_: unknown, record: LandingPage) => {
        const renderChannel = () => {
          if (!record.channel_id) {
            return <span style={{ color: '#999' }}>未选择渠道</span>
          }
          const channel = channelMap.get(record.channel_id as number)
          if (!channel) {
            return <span>渠道 ID：{record.channel_id}</span>
          }
          return (
            <span>
              渠道名称：{channel.name || `渠道 ${channel.id}`}（ID：{channel.id}）
            </span>
          )
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: '#888' }}>落地页 ID</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{record.id}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888' }}>模板 ID</div>
              <div style={{ fontSize: 15 }}>{record.template_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#888' }}>渠道</div>
              <div style={{ fontSize: 14 }}>{renderChannel()}</div>
            </div>
          </div>
        )
      },
    },
    {
      title: '视频素材',
      dataIndex: 'selected_video_ids',
      render: (ids: number[] = [], record: LandingPage) => {
        const orderText = ids.length ? `顺序：${ids.join(' / ')}` : ''
        const videos = record.selected_videos ?? []

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {videos.length ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 16,
                  }}
                >
                  {videos.map((video) => {
                    const title = video.title || '未命名视频'
                    return (
                      <div
                        key={video.id}
                        style={{
                          width: 150,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: 170,
                            borderRadius: 16,
                            overflow: 'hidden',
                            background: '#f4f4f4',
                          }}
                        >
                          {video.poster_url ? (
                            <img
                              src={resolveStaticUrl(video.poster_url)}
                              alt={title}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={title}
                        >
                          {title}
                        </div>
                        <div style={{ fontSize: 12, color: '#999' }}>
                          视频 ID：{video.id}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {orderText ? (
                  <div style={{ fontSize: 12, color: '#bbb' }}>{orderText}</div>
                ) : null}
              </>
            ) : (
              <div style={{ color: '#999' }}>暂无视频数据</div>
            )}
          </div>
        )
      },
    },
    {
      title: '生成页面 / 语言',
      dataIndex: 'generated_page_url',
      width: 520,
      render: (url: string, record: LandingPage) => {
        const previewUrl = resolvePreviewUrl(url)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {renderLanguageTag(record.language)}
              <span style={{ fontSize: 12, color: '#555' }}>访问链接：</span>
            </div>
            <div style={{ fontSize: 12, color: '#555' }}>
              {url ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ wordBreak: 'break-all' }}
                >
                  {previewUrl}
                </a>
              ) : (
                '-'
              )}
            </div>
            {record.package_url && (
              <Button
                type="primary"
                size="small"
                href={`${backendBaseUrl}${record.package_url}`}
                target="_blank"
                rel="noreferrer"
                download
                style={{ alignSelf: 'flex-start' }}
              >
                下载落地页包
              </Button>
            )}
            {previewUrl ? (
              <div
                style={{
                  width: 320,
                  height: 620,
                  borderRadius: 12,
                  border: '1px solid #e5e5e5',
                  overflow: 'hidden',
                  background: '#fafafa',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <iframe
                  title="landing-page-preview"
                  src={previewUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: 320,
                  height: 620,
                  borderRadius: 12,
                  border: '1px dashed #ddd',
                  background: '#fafafa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#999',
                  fontSize: 13,
                }}
              >
                暂无预览
              </div>
            )}
          </div>
        )
      },
    },
  ]

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !Number.isFinite(workflowId)) return
    setUploading(true)
    try {
      await uploadWorkflowAdImage(workflowId, file)
      message.success('上传成功')
      refetchAdImages()
      refetchDetail()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败'
      message.error(msg)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleDownloadAdImages = () => {
    if (!Number.isFinite(workflowId)) return
    const url = `${apiBaseUrl.replace(/\/$/, '')}/workflows/${workflowId}/ad-images/download`
    window.open(url, '_blank')
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="获取工作流详情失败"
        description={error instanceof Error ? error.message : String(error)}
      />
    )
  }

  return (
    <Card loading={isLoading}>
      {data && (
        <>
          <Title level={4}>工作流详情：{data.name}</Title>
          <Paragraph>
            ID：{data.id}，创建人：{data.created_by}，创建时间：
            {data.created_at}
          </Paragraph>
          <Paragraph>
            当前状态：
            <Tag color={WORKFLOW_STATUS_COLOR[data.status]}>
              {WORKFLOW_STATUS_LABEL[data.status]}
            </Tag>
            <span style={{ marginLeft: 12, color: '#666' }}>
              已上传广告图：{data.ad_image_count} 张
            </span>
          </Paragraph>
          <Paragraph type="secondary">
            {data.campaign_names && data.campaign_names.length > 0 ? (
              <>已关联投流计划：{data.campaign_names.join(' / ')}</>
            ) : (
              '尚未关联投流计划'
            )}
          </Paragraph>

          <Title level={5} style={{ marginTop: 24 }}>
            落地页列表
          </Title>
          <Table<LandingPage>
            rowKey="id"
            columns={columns}
            dataSource={data.landing_pages ?? []}
            pagination={false}
          />

          <Title level={5} style={{ marginTop: 32 }}>
            广告图
          </Title>
          <div style={{ marginBottom: 12 }}>
            <Button
              type="primary"
              onClick={handleUploadClick}
              disabled={!Number.isFinite(workflowId)}
              loading={uploading}
            >
              上传广告图
            </Button>
            <Button
              type="primary"
              style={{ marginLeft: 12 }}
              onClick={handleDownloadAdImages}
              disabled={!Number.isFinite(workflowId)}
            >
              下载广告图包
            </Button>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
          {adImagesLoading ? (
            <Spin />
          ) : adImages && adImages.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              {adImages.map((img: WorkflowAdImage) => (
                <div
                  key={img.id}
                  style={{
                    width: 180,
                    borderRadius: 12,
                    border: '1px solid #eee',
                    background: '#fff',
                    padding: 8,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: 180,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#f4f4f4',
                      marginBottom: 8,
                    }}
                  >
                    <img
                      src={resolveStaticUrl(img.file_url)}
                      alt={img.file_name || '广告图'}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#555',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={img.file_name || undefined}
                  >
                    {img.file_name || '广告图'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#999' }}>尚未上传广告图</div>
          )}
        </>
      )}
    </Card>
  )
}
