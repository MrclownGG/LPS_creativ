import { useState } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useTemplates,
  type Template,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type TemplateInput,
} from '../api/templates'

const { Option } = Select

export const TemplateListPage: React.FC = () => {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  )
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)

  const [form] = Form.useForm()

  const { data, isLoading } = useTemplates({
    status: statusFilter,
    page,
    page_size: pageSize,
  })

  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      message.success('模板创建成功')
      setIsModalOpen(false)
      setEditingTemplate(null)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '模板创建失败，请稍后重试'
      message.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (params: { id: number; data: TemplateInput }) =>
      updateTemplate(params.id, params.data),
    onSuccess: () => {
      message.success('模板更新成功')
      setIsModalOpen(false)
      setEditingTemplate(null)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '模板更新失败，请稍后重试'
      message.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      message.success('模板删除成功')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '模板删除失败，请稍后重试'
      message.error(msg)
    },
  })

  const handleCreate = () => {
    setEditingTemplate(null)
    form.resetFields()
    // 默认填入我们复制的 home 模板路径，方便第一次使用
    form.setFieldsValue({
      html_file_path: 'LPS/templates/home/index.html',
      static_assets_path: 'LPS/templates/home',
      max_videos: 3,
      status: 'active',
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: Template) => {
    setEditingTemplate(record)
    form.setFieldsValue({
      name: record.name,
      description: record.description ?? undefined,
      thumbnail_url: record.thumbnail_url ?? undefined,
      html_file_path: record.html_file_path,
      max_videos: record.max_videos,
      static_assets_path: record.static_assets_path ?? undefined,
      status: record.status,
    })
    setIsModalOpen(true)
  }

  const handleModalCancel = () => {
    setIsModalOpen(false)
    setEditingTemplate(null)
  }

  const handleFormFinish = (values: any) => {
    const payload: TemplateInput = {
      name: values.name,
      description: values.description || undefined,
      thumbnail_url: values.thumbnail_url || undefined,
      html_file_path: values.html_file_path,
      max_videos: values.max_videos,
      static_assets_path: values.static_assets_path || undefined,
      status: values.status || 'active',
    }

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const columns: ColumnsType<Template> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: '最大视频数',
      dataIndex: 'max_videos',
      width: 120,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => (
        <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag>
      ),
    },
    {
      title: 'HTML 路径',
      dataIndex: 'html_file_path',
      ellipsis: true,
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
            description={`确定要删除模板「${record.name}」吗？`}
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

  const modalTitle = editingTemplate ? '编辑模板信息' : '新建模板'
  const isSubmitting = createMutation.isPending || updateMutation.isPending

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
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 180 }}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
        >
          <Option value="active">active</Option>
          <Option value="inactive">inactive</Option>
        </Select>
        <Button type="primary" onClick={handleCreate}>
          新建模板
        </Button>
      </div>

      <Table<Template>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
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
          initialValues={{ status: 'active', max_videos: 3 }}
        >
          <Form.Item
            label="模板名称"
            name="name"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="例如：首页模板 V1" />
          </Form.Item>
          <Form.Item label="模板描述" name="description">
            <Input.TextArea
              placeholder="该模板的用途说明，可留空"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item label="缩略图 URL" name="thumbnail_url">
            <Input placeholder="例如：/templates/home/images/banner1.jpg，可留空" />
          </Form.Item>
          <Form.Item
            label="HTML 文件路径"
            name="html_file_path"
            rules={[{ required: true, message: '请输入 HTML 文件路径' }]}
          >
            <Input placeholder="例如：LPS/templates/home/index.html" />
          </Form.Item>
          <Form.Item
            label="最大视频数"
            name="max_videos"
            rules={[
              { required: true, message: '请输入最大视频数' },
              { type: 'number', min: 1, message: '至少为 1' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="静态资源路径" name="static_assets_path">
            <Input placeholder="例如：LPS/templates/home，可留空" />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select>
              <Option value="active">active</Option>
              <Option value="inactive">inactive</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

