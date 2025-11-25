import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card,
  Typography,
  Table,
  Button,
  message,
  Space,
  Alert,
  App,
  Modal,
  Input,
  Tag,
  Select,
  DatePicker,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'

import { useVideos, type Video } from '../api/videos'
import { useTemplates, type Template } from '../api/templates'
import { apiClient } from '../api/client'
import { generateWorkflow, previewWorkflow } from '../api/workflows'

const { Title, Paragraph, Text } = Typography
const { Search } = Input
const { Option } = Select
const { RangePicker } = DatePicker

export const WorkflowGeneratePage: React.FC = () => {
  const { modal } = App.useApp()
  const navigate = useNavigate()
  const params = useParams<{ workflowId: string }>()
  const workflowId = Number(params.workflowId)

  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([])

  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // 前端本地过滤状态（不改变接口参数）
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(
    undefined,
  )
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)

  const {
    data: videoData,
    isLoading: videosLoading,
  } = useVideos({
    page: 1,
    page_size: 100,
  })

  const {
    data: templateData,
    isLoading: templatesLoading,
  } = useTemplates({
    status: 'active',
    page: 1,
    page_size: 100,
  })

  const allVideos = videoData?.items ?? []

  const backendBaseUrl =
    apiClient.defaults.baseURL?.replace(/\/api\/?$/, '') ?? ''

  const createMutation = useMutation({
    mutationFn: () =>
      generateWorkflow(workflowId, {
        video_ids: selectedVideoIds,
        template_ids: selectedTemplateIds,
      }),
    onSuccess: () => {
      message.success('落地页生成成功（状态已进入：广告待上传）')
      navigate('/workflows')
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '生成落地页失败，请稍后重试'
      modal.error({
        title: '生成落地页失败',
        content: msg,
      })
    },
  })

  const previewMutation = useMutation({
    mutationFn: (templateId: number) =>
      previewWorkflow({
        video_ids: selectedVideoIds,
        template_id: templateId,
      }),
    onSuccess: (url) => {
      setPreviewUrl(url)
      setPreviewVisible(true)
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '预览落地页失败，请稍后重试'
      modal.error({
        title: '预览落地页失败',
        content: msg,
      })
    },
  })

  const templateColumns: ColumnsType<Template> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '最大视频数',
      dataIndex: 'max_videos',
      width: 120,
    },
  ]

  const canGenerate =
    workflowId > 0 &&
    selectedVideoIds.length > 0 &&
    selectedTemplateIds.length > 0

  // 分类选项（从当前视频的 category 去重）
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    allVideos.forEach((v) => {
      if (v.category) {
        set.add(v.category)
      }
    })
    return Array.from(set)
  }, [allVideos])

  // 本地过滤视频列表
  const filteredVideos: Video[] = useMemo(() => {
    const lower = keyword.trim().toLowerCase()

    return allVideos.filter((video) => {
      // 关键字：标题 / 分类模糊匹配
      if (lower) {
        const inTitle = video.title.toLowerCase().includes(lower)
        const inCategory = (video.category ?? '')
          .toLowerCase()
          .includes(lower)
        if (!inTitle && !inCategory) {
          return false
        }
      }

      // 分类筛选
      if (categoryFilter && video.category !== categoryFilter) {
        return false
      }

      // 日期范围筛选（基于 updated_at）
      if (dateRange && dateRange[0] && dateRange[1]) {
        if (!video.updated_at) {
          return false
        }
        const updated = dayjs(video.updated_at)
        if (!updated.isValid()) {
          return false
        }
        const start = dateRange[0].startOf('day')
        const end = dateRange[1].endOf('day')
        if (updated.isBefore(start) || updated.isAfter(end)) {
          return false
        }
      }

      return true
    })
  }, [allVideos, keyword, categoryFilter, dateRange])

  // 切换选中状态：先选的卡片排在前面（决定模板中图片位置）
  const toggleSelectVideo = (id: number) => {
    setSelectedVideoIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  // 本地校验：检查选择的视频数量是否满足所选模板的 max_videos 要求
  const validateSelection = (): boolean => {
    if (!canGenerate) {
      modal.warning({
        title: '无法生成落地页',
        content: '请至少选择 1 个视频和 1 个模板',
      })
      return false
    }

    const templates = templateData?.items ?? []
    const selectedIdSet = new Set(selectedTemplateIds.map((id) => Number(id)))
    const selectedTemplates = templates.filter((t) =>
      selectedIdSet.has(Number(t.id)),
    )

    if (selectedTemplates.length === 0) {
      modal.error({
        title: '无法生成落地页',
        content: '选中的模板不存在，请刷新页面后重试',
      })
      return false
    }

    const maxRequired = Math.max(
      ...selectedTemplates.map((t) => t.max_videos || 0),
    )

    if (selectedVideoIds.length < maxRequired) {
      modal.error({
        title: '无法生成落地页',
        content: `当前选中的模板中，最大需要 ${maxRequired} 个视频，你只选了 ${selectedVideoIds.length} 个，请多选一些视频后再生成。`,
      })
      return false
    }

    return true
  }

  const handlePreview = () => {
    if (!validateSelection()) return
    if (selectedTemplateIds.length !== 1) {
      modal.warning({
        title: '无法预览',
        content: '当前预览仅支持单个模板，请只勾选 1 个模板',
      })
      return
    }
    const templateId = selectedTemplateIds[0]
    previewMutation.mutate(templateId)
  }

  return (
    <Card>
      <Title level={4}>生成落地页</Title>
      <Paragraph>
        工作流 ID：{workflowId}。请选择要使用的视频素材和模板，然后点击下方按钮生成落地页。
      </Paragraph>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Step 1：选择视频素材 */}
        <div>
          <Title level={5}>Step 1：选择视频素材</Title>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message="提示：已勾选的视频数量必须不少于所选模板中最大的 max_videos 要求，否则无法生成；图片在模板中的位置将按照选中顺序从左到右、从上到下排列。"
          />

          {/* 筛选工具栏 */}
          <Space
            style={{ marginBottom: 12, width: '100%', flexWrap: 'wrap' }}
            size={12}
          >
            <Search
              placeholder="按标题或分类搜索"
              allowClear
              onSearch={(value) => setKeyword(value.trim())}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              placeholder="按分类筛选"
              style={{ width: 180 }}
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value || undefined)}
            >
              {categoryOptions.map((c) => (
                <Option key={c} value={c}>
                  {c}
                </Option>
              ))}
            </Select>
            <RangePicker
              allowEmpty={[true, true]}
              onChange={(values) =>
                setDateRange(
                  values && values[0] && values[1]
                    ? [values[0], values[1]]
                    : null,
                )
              }
            />
            <Text type="secondary">
              已选视频数：{selectedVideoIds.length} / {allVideos.length}
            </Text>
          </Space>

          {/* 视频卡片网格 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {videosLoading && allVideos.length === 0 && (
              <div>加载中...</div>
            )}
            {!videosLoading &&
              filteredVideos.map((video) => {
                const isSelected = selectedVideoIds.includes(video.id)
                const orderIndex = selectedVideoIds.indexOf(video.id)
                const orderNumber =
                  orderIndex >= 0 ? orderIndex + 1 : undefined

                const url = video.poster_url
                const src =
                  url && (/^https?:\/\//i.test(url) || url.startsWith('//'))
                    ? url
                    : url
                      ? `${backendBaseUrl}${url}`
                      : ''

                const updatedText = video.updated_at
                  ? dayjs(video.updated_at).format('YYYY-MM-DD HH:mm')
                  : '-'

                return (
                  <Card
                    key={video.id}
                    hoverable
                    size="small"
                    bodyStyle={{ padding: 8 }}
                    style={{
                      fontSize: 13,
                      borderColor: isSelected ? '#1677ff' : undefined,
                      boxShadow: isSelected
                        ? '0 0 0 2px rgba(22, 119, 255, 0.2)'
                        : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleSelectVideo(video.id)}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: 200,
                        borderRadius: 4,
                        overflow: 'hidden',
                        background: '#f5f5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 8,
                      }}
                    >
                      {orderNumber && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 4,
                            left: 4,
                            backgroundColor: 'rgba(22, 119, 255, 0.9)',
                            color: '#fff',
                            borderRadius: 999,
                            padding: '2px 6px',
                            fontSize: 11,
                            lineHeight: 1,
                          }}
                        >
                          {orderNumber}
                        </div>
                      )}
                      {src ? (
                        <img
                          src={src}
                          alt={video.title}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>
                          暂无封面
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: 14,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: 4,
                      }}
                      title={video.title}
                    >
                      {video.title}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 2,
                      }}
                    >
                      <div>
                        {video.category ? (
                          <Tag color="blue" style={{ marginRight: 0 }}>
                            {video.category}
                          </Tag>
                        ) : (
                          <Tag style={{ marginRight: 0 }}>未分类</Tag>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#666',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        观看量：{video.view_count}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#999',
                        textAlign: 'right',
                      }}
                    >
                      获取时间：{updatedText}
                    </div>
                  </Card>
                )
              })}
          </div>
        </div>

        {/* Step 2：选择模板 */}
        <div>
          <Title level={5}>Step 2：选择模板</Title>
          <Table<Template>
            rowKey="id"
            loading={templatesLoading}
            columns={templateColumns}
            dataSource={templateData?.items ?? []}
            rowSelection={{
              selectedRowKeys: selectedTemplateIds,
              onChange: (keys) => setSelectedTemplateIds(keys as number[]),
            }}
            pagination={false}
            size="small"
          />
        </div>

        {/* 操作区 */}
        <div>
          <Button
            type="primary"
            disabled={!canGenerate}
            loading={createMutation.isPending}
            onClick={() => {
              if (!validateSelection()) return
              createMutation.mutate()
            }}
          >
            生成落地页
          </Button>

          <Button
            style={{ marginLeft: 8 }}
            disabled={!canGenerate}
            loading={previewMutation.isPending}
            onClick={handlePreview}
          >
            预览
          </Button>

          {!canGenerate && (
            <span style={{ marginLeft: 12, color: '#999' }}>
              请至少选择 1 个视频和 1 个模板
            </span>
          )}
        </div>
      </Space>

      <Modal
        title="落地页预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={480}
        style={{ top: 40 }}
        destroyOnClose
      >
        {previewUrl && (
          <div
            style={{
              margin: '0 auto',
              width: 430,
              height: 800,
              maxWidth: '100%',
              maxHeight: '80vh',
              borderRadius: 12,
              border: '1px solid #ddd',
              overflow: 'hidden',
              boxShadow: '0 0 0 8px #f0f0f0',
            }}
          >
            <iframe
              src={`${backendBaseUrl}${previewUrl}`}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        )}
      </Modal>
    </Card>
  )
}

