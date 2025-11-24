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
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import {
  useVideos,
  type Video,
  createVideo,
  updateVideo,
  deleteVideo,
  type VideoCreateInput,
} from '../api/videos'

const { Search } = Input

/**
 * 视频列表页面
 *
 * 功能：
 * - 查询视频列表（分页）
 * - 搜索（前端过滤：标题 / 分类）
 * - 手动导入视频（新建）
 * - 编辑视频
 * - 删除视频
 */
export const VideoListPage: React.FC = () => {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [keyword, setKeyword] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)

  const [form] = Form.useForm()

  const { data, isLoading } = useVideos({
    page,
    page_size: pageSize,
  })

  const createMutation = useMutation({
    mutationFn: createVideo,
    onSuccess: () => {
      message.success('视频导入成功')
      setIsModalOpen(false)
      setEditingVideo(null)
      form.resetFields()
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
      setIsModalOpen(false)
      setEditingVideo(null)
      form.resetFields()
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

  const handleSearch = (value: string) => {
    setKeyword(value.trim())
  }

  const handleCreate = () => {
    setEditingVideo(null)
    form.resetFields()
    setIsModalOpen(true)
  }

  const handleEdit = (record: Video) => {
    setEditingVideo(record)
    form.setFieldsValue({
      external_id: undefined,
      title: record.title,
      category: record.category ?? undefined,
      poster_url: record.poster_url,
      view_count: record.view_count,
    })
    setIsModalOpen(true)
  }

  const handleModalCancel = () => {
    setIsModalOpen(false)
    setEditingVideo(null)
  }

  const handleFormFinish = (values: any) => {
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

  const filteredItems =
    data?.items.filter((video) => {
      if (!keyword) return true
      const lower = keyword.toLowerCase()
      return (
        video.title.toLowerCase().includes(lower) ||
        video.category?.toLowerCase().includes(lower)
      )
    }) ?? []

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
        value ? <Tag color="blue">{value}</Tag> : <Tag>未分类</Tag>,
    },
    {
      title: '海报 URL',
      dataIndex: 'poster_url',
      ellipsis: true,
    },
    {
      title: '观看量',
      dataIndex: 'view_count',
      width: 120,
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 180,
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
          <Popconfirm
            title="确认删除"
            description={`确定要删除视频「${record.title}」吗？`}
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

  const modalTitle = editingVideo ? '编辑视频信息' : '手动导入视频素材'
  const isSubmitting = createMutation.isPending || updateMutation.isPending

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
          手动导入视频
        </Button>
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
        title={modalTitle}
        open={isModalOpen}
        onCancel={handleModalCancel}
        onOk={() => form.submit()}
        confirmLoading={isSubmitting}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormFinish}
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
            <Input placeholder="https://..." />
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
    </Card>
  )
}

