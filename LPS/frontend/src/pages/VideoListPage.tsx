import { useState } from 'react'
import {
  Card,
  Tag,
  Input,
  Button,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
  DatePicker,
  Select,
  Pagination,
} from 'antd'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'

import {
  useVideos,
  type Video,
  createVideo,
  updateVideo,
  deleteVideo,
  type VideoCreateInput,
  syncVideos,
  type VideoSyncData,
  uploadVideoPoster,
} from '../api/videos'
import { apiClient } from '../api/client'

const { Search } = Input
const { RangePicker } = DatePicker
const { Option } = Select

export const VideoListPage: React.FC = () => {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(54)
  const [keyword, setKeyword] = useState('')
  const [viewSort, setViewSort] = useState<'none' | 'asc' | 'desc'>('none')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)

  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)

  const [editForm] = Form.useForm()
  const [syncForm] = Form.useForm()

  const { data, isLoading } = useVideos({
    page,
    page_size: pageSize,
  })

  const backendBaseUrl =
    apiClient.defaults.baseURL?.replace(/\/api\/?$/, '') ?? ''

  const createMutation = useMutation({
    mutationFn: createVideo,
    onSuccess: () => {
      message.success('视频导入成功')
      setIsEditModalOpen(false)
      setEditingVideo(null)
      editForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '视频导入失败，请稍后重试'
      message.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (params: { id: number; data: VideoCreateInput }) =>
      updateVideo(params.id, params.data),
    onSuccess: () => {
      message.success('视频更新成功')
      setIsEditModalOpen(false)
      setEditingVideo(null)
      editForm.resetFields()
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '视频更新失败，请稍后重试'
      message.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVideo,
    onSuccess: () => {
      message.success('视频删除成功')
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '视频删除失败，请稍后重试'
      message.error(msg)
    },
  })

  const syncMutation = useMutation({
    mutationFn: (params: {
      start_date?: string
      end_date?: string
      limit?: number
    }) => syncVideos(params),
    onSuccess: (result: VideoSyncData) => {
      message.success(
        `从 API 导入完成，新建 ${result.imported_count} 条，更新 ${result.updated_count} 条`,
      )
      setIsSyncModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error
          ? error.message
          : '从 API 导入视频失败，请稍后重试'
      message.error(msg)
    },
  })

  const uploadPosterMutation = useMutation({
    mutationFn: (params: { id: number; file: File }) =>
      uploadVideoPoster(params.id, params.file),
    onSuccess: () => {
      message.success('封面已更新')
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '封面更新失败，请稍后重试'
      message.error(msg)
    },
  })

  const handleSearch = (value: string) => {
    setKeyword(value.trim())
    setPage(1)
  }

  const handleCreate = () => {
    setEditingVideo(null)
    editForm.resetFields()
    setIsEditModalOpen(true)
  }

  const handleEdit = (record: Video) => {
    setEditingVideo(record)
    editForm.setFieldsValue({
      external_id: undefined,
      title: record.title,
      category: record.category ?? undefined,
      poster_url: record.poster_url,
      view_count: record.view_count,
    })
    setIsEditModalOpen(true)
  }

  const handleEditModalCancel = () => {
    setIsEditModalOpen(false)
    setEditingVideo(null)
  }

  const handleOpenSyncModal = () => {
    const yesterday = dayjs().subtract(1, 'day').startOf('day')
    syncForm.setFieldsValue({
      source: 'stcine',
      dateRange: [yesterday, yesterday],
      limit: 50,
    })
    setIsSyncModalOpen(true)
  }

  const handleEditFormFinish = (values: any) => {
    const payload: VideoCreateInput = {
      external_id: values.external_id || undefined,
      title: values.title,
      category: values.category || undefined,
      poster_url: values.poster_url,
      view_count: values.view_count ?? 0,
    }

    if (editingVideo) {
      updateMutation.mutate({ id: editingVideo.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleSyncFormFinish = (values: {
    source: string
    dateRange: [Dayjs, Dayjs]
    limit?: number
  }) => {
    if (values.source !== 'stcine') {
      message.error('当前仅支持从 STCine 热门排行榜导入')
      return
    }

    const [start, end] = values.dateRange || []

    const params: {
      start_date?: string
      end_date?: string
      limit?: number
    } = {}

    if (start) {
      params.start_date = start.format('YYYY-MM-DD')
    }
    if (end) {
      params.end_date = end.format('YYYY-MM-DD')
    }
    if (values.limit != null) {
      params.limit = values.limit
    }

    syncMutation.mutate(params)
  }

  const handleChangePoster = (video: Video) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      uploadPosterMutation.mutate({ id: video.id, file })
    }
    input.click()
  }

  let filteredItems =
    data?.items.filter((video) => {
      if (!keyword) return true
      const lower = keyword.toLowerCase()
      return (
        video.title.toLowerCase().includes(lower) ||
        (video.category ?? '').toLowerCase().includes(lower)
      )
    }) ?? []

  if (viewSort === 'asc') {
    filteredItems = [...filteredItems].sort(
      (a, b) => a.view_count - b.view_count,
    )
  } else if (viewSort === 'desc') {
    filteredItems = [...filteredItems].sort(
      (a, b) => b.view_count - a.view_count,
    )
  }

  const handleThumbClick = (video: Video) => {
    const url = video.poster_url
    if (!url) return
    const src =
      /^https?:\/\//i.test(url) || url.startsWith('//')
        ? url
        : `${backendBaseUrl}${url}`
    setPreviewImageUrl(src)
    setPreviewVisible(true)
  }

  return (
    <Card>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <Search
          placeholder="按标题或分类搜索"
          allowClear
          enterButton
          onSearch={handleSearch}
          style={{ width: 320 }}
        />
        <Button type="primary" onClick={handleCreate}>
          手动导入
        </Button>
        <Button onClick={handleOpenSyncModal}>从 API 导入</Button>
        <Button
          type="link"
          onClick={() =>
            setViewSort((prev) =>
              prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none',
            )
          }
        >
          播放量排序：
          {viewSort === 'none'
            ? '默认'
            : viewSort === 'desc'
              ? '高→低'
              : '低→高'}
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginTop: 32,
        }}
      >
        {isLoading && filteredItems.length === 0 ? (
          <div>加载中...</div>
        ) : (
          filteredItems.map((video) => {
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
                bodyStyle={{ padding: 12 }}
                style={{ fontSize: 13 }}
              >
                <div
                  style={{
                    width: '100%',
                    height: 280,
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: src ? 'pointer' : 'default',
                  }}
                  onClick={() => src && handleThumbClick(video)}
                >
                  {src && (
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
                  )}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 500,
                    fontSize: 14,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={video.title}
                >
                  {video.title}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
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
                  <div style={{ fontSize: 12, color: '#666' }}>
                    播放量：{video.view_count}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    color: '#999',
                    textAlign: 'right',
                  }}
                >
                  获取时间：{updatedText}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Button
                    type="link"
                    size="small"
                    onClick={() => handleEdit(video)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => handleChangePoster(video)}
                    disabled={uploadPosterMutation.isPending}
                  >
                    修改封面
                  </Button>
                  <Popconfirm
                    title="确认删除"
                    description={`确定要删除视频「${video.title}」吗？`}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{
                      danger: true,
                      loading: deleteMutation.isPending,
                    }}
                    onConfirm={() => deleteMutation.mutate(video.id)}
                  >
                    <Button danger size="small">
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </Card>
            )
          })
        )}
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Pagination
          size="small"
          current={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          showSizeChanger
          pageSizeOptions={[54, 108]}
          showTotal={(total) => `共 ${total} 条`}
          onChange={(p, ps) => {
            setPage(p)
            if (ps !== pageSize) {
              setPageSize(ps)
            }
          }}
        />
      </div>

      <Modal
        title={editingVideo ? '编辑视频信息' : '手动导入'}
        open={isEditModalOpen}
        onCancel={handleEditModalCancel}
        onOk={() => editForm.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditFormFinish}
          initialValues={{ view_count: 0 }}
        >
          <Form.Item label="外部视频 ID（可选）" name="external_id">
            <Input placeholder="例如外部系统的 video_id，可留空" />
          </Form.Item>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请输入视频标题' }]}
          >
            <Input placeholder="请输入视频标题" />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="例如 tutorial、promo 等，可留空" />
          </Form.Item>
          <Form.Item
            label="封面图 URL"
            name="poster_url"
            rules={[{ required: true, message: '请输入封面图 URL' }]}
          >
            <Input placeholder="https://... 或 /generated/..." />
          </Form.Item>
          <Form.Item
            label="观看量"
            name="view_count"
            rules={[{ type: 'number', min: 0, message: '观看量不能为负数' }]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从 API 导入视频"
        open={isSyncModalOpen}
        onCancel={() => setIsSyncModalOpen(false)}
        onOk={() => syncForm.submit()}
        confirmLoading={syncMutation.isPending}
      >
        <Form
          form={syncForm}
          layout="vertical"
          onFinish={handleSyncFormFinish}
        >
          <Form.Item
            label="数据来源"
            name="source"
            rules={[{ required: true, message: '请选择数据来源' }]}
          >
            <Select placeholder="请选择数据来源">
              <Option value="stcine">STCine 热门排行</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="日期范围"
            name="dateRange"
            rules={[{ required: true, message: '请选择日期范围' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="同步条数（limit）"
            name="limit"
            rules={[
              {
                type: 'number',
                min: 1,
                max: 500,
                message: '请输入 1-500 之间的数字',
              },
            ]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="封面预览"
        open={previewVisible}
        footer={null}
        width={800}
        onCancel={() => setPreviewVisible(false)}
      >
        {previewImageUrl && (
          <img
            src={previewImageUrl}
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto',
            }}
          />
        )}
      </Modal>
    </Card>
  )
}
