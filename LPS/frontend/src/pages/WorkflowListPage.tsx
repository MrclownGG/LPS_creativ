import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useWorkflows,
  type Workflow,
  type WorkflowStatus,
  createWorkflow,
  deleteWorkflow,
} from '../api/workflows'

const { Option } = Select

// 状态中文映射
const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: '草稿',
  generating: '生成中',
  pending_ad: '广告待上传',
  ready: '准备完成（待投流）',
  in_use: '已投放',
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

export const WorkflowListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | undefined>(
    undefined,
  )
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [form] = Form.useForm()

  const { data, isLoading } = useWorkflows({
    status: statusFilter,
    page,
    page_size: pageSize,
  })

  const createMutation = useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      message.success('工作流批次创建成功')
      setIsModalOpen(false)
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '创建工作流失败，请稍后重试'
      message.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      message.success('工作流批次已删除')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : '删除工作流失败，请稍后重试'
      message.error(msg)
    },
  })

  const handleCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      created_by: 'designer_a', // 临时默认值，后续接入登录后可替换
    })
    setIsModalOpen(true)
  }

  const handleModalCancel = () => {
    setIsModalOpen(false)
  }

  const handleFormFinish = (values: any) => {
    createMutation.mutate({
      name: values.name,
      created_by: values.created_by || undefined,
    })
  }

  const columns: ColumnsType<Workflow> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '批次名称',
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 160,
      render: (value: WorkflowStatus) => (
        <Tag color={WORKFLOW_STATUS_COLOR[value]}>
          {WORKFLOW_STATUS_LABEL[value] ?? value}
        </Tag>
      ),
    },
    {
      title: '落地页数量',
      dataIndex: 'landing_page_count',
      width: 120,
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 120,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 200,
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 280,
      render: (_, record) => (
        <>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/workflows/${record.id}`)}
          >
            查看详情
          </Button>
          <Button
            type="link"
            size="small"
            disabled={record.status !== 'draft'}
            onClick={() => navigate(`/workflows/${record.id}/generate`)}
          >
            生成落地页
          </Button>
          <Popconfirm
            title="确认删除该工作流批次？"
            description="删除后将无法恢复，但不会影响素材库和模板。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              loading={deleteMutation.isPending}
            >
              删除
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ]

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
          style={{ width: 220 }}
          value={statusFilter}
          onChange={(value) =>
            setStatusFilter(value as WorkflowStatus | undefined)
          }
        >
          <Option value="draft">草稿</Option>
          <Option value="generating">生成中</Option>
          <Option value="pending_ad">广告待上传</Option>
          <Option value="ready">准备完成（待投流）</Option>
          <Option value="in_use">已投放</Option>
          <Option value="archived">已归档</Option>
        </Select>
        <Button type="primary" onClick={handleCreate}>
          新建落地页批次
        </Button>
      </div>

      <Table<Workflow>
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
        title="新建落地页批次"
        open={isModalOpen}
        onCancel={handleModalCancel}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={handleFormFinish}>
          <Form.Item
            label="批次名称"
            name="name"
            rules={[{ required: true, message: '请输入批次名称' }]}
          >
            <Input placeholder="例如：11 月黑五活动 - 视频合集 A" />
          </Form.Item>
          <Form.Item label="创建人" name="created_by">
            <Input placeholder="例如：designer_a，可留空使用默认" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

