import { useState } from 'react'
import {
  Card,
  Table,
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
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
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

const { Search } = Input
const { RangePicker } = DatePicker

export const VideoListPage: React.FC = () => {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [viewSort, setViewSort] = useState<'none' | 'asc' | 'desc'>('none')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)

  const [editForm] = Form.useForm()
  const [syncForm] = Form.useForm()

  const { data, isLoading } = useVideos({
    page,
    page_size: pageSize,
  })

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
        `�?API 导入完成，新�?${result.imported_count} 条，更新 ${result.updated_count} 条`,
      )
      setIsSyncModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['videos'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error
          ? error.message
          : '�?API 导入视频失败，请稍后重试'
      message.error(msg)
    },
  })

  const uploadPosterMutation = useMutation({
    mutationFn: (params: { id: number; file: File }) =>
      uploadVideoPoster(params.id, params.file),
    onSuccess: () => {
      message.success('封面已更�?)
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
      message.error('当前仅支持从 STCine 热门排行榜导�?)
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

  const columns: ColumnsType<Video> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 120,
      render: (value: string | null | undefined) =>
        value ? <Tag color="blue">{value}</Tag> : <Tag>未分�?/Tag>,
    },
    {
      title: '海报 URL',
      dataIndex: 'poster_url',
      ellipsis: true,
    },
    {
      title: (
        <span>
          观看量{' '}
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => {
              setViewSort((prev) =>
                prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none',
              )
            }}
          >
            {viewSort === 'none' ? '↑↓' : viewSort === 'desc' ? '�? : '�?}
          </Button>
        </span>
      ),
      dataIndex: 'view_count',
      width: 120,
    },
    {
      title: '获取时间',
      dataIndex: 'updated_at',
      width: 180,
      render: (value: string | null | undefined) =>
        value ? (
          <Tooltip title={value}>
            {dayjs(value).format('YYYY-MM-DD HH:mm')}
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 260,
      render: (_, record) => (
        <>
          <Button
            type="link"
            size="small"
            onClick={() => handleEdit(record)}
            style={{ paddingLeft: 0 }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleChangePoster(record)}
            disabled={uploadPosterMutation.isPending}
          >
            修改封面
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除视频�?{record.title}」吗？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ]

  const editModalTitle = editingVideo ? '编辑视频信息' : '手动导入'
  const isEditSubmitting =
    createMutation.isPending || updateMutation.isPending

  return (
    <Card>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
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
        <Button onClick={handleOpenSyncModal}>�?API 导入</Button>
      </div>

      <Table<Video>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filteredItems}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
      />

      <Modal
        title={editModalTitle}
        open={isEditModalOpen}
        onCancel={handleEditModalCancel}
        onOk={() => editForm.submit()}
        confirmLoading={isEditSubmitting}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditFormFinish}
          initialValues={{ view_count: 0 }}
        >
          <Form.Item label="外部视频 ID（可选）" name="external_id">
            <Input placeholder="例如外部系统�?video_id，可留空" />
          </Form.Item>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请输入视频标�? }]}
          >
            <Input placeholder="请输入视频标�? />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="例如 tutorial、promo 等，可留�? />
          </Form.Item>
          <Form.Item
            label="封面�?URL"
            name="poster_url"
            rules={[{ required: true, message: '请输入封面图 URL' }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item
            label="观看�?
            name="view_count"
            rules={[{ type: 'number', min: 0, message: '观看量不能为负数' }]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="�?API 导入视频"
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
            <Select
              options={[
                {
                  label: 'STCine 热门排行�?,
                  value: 'stcine',
                },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="日期范围"
            name="dateRange"
            rules={[{ required: true, message: '请选择日期范围' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="同步条数（limit�?
            name="limit"
            rules={[
              {
                type: 'number',
                min: 1,
                max: 500,
                message: '请输�?1-500 之间的数�?,
              },
            ]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}


