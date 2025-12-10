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

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  operator: '投放人员',
  designer: '美工',
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
    setIsModalOpen(true)
  }

  const handleModalCancel = () => {
    setIsModalOpen(false)
  }

  const handleFormFinish = (values: any) => {
    createMutation.mutate({
      name: values.name,
    })
  }

  const renderLanguagesSummary = (wf: Workflow): string => {
    const langs = wf.languages ?? []
    if (!wf.landing_page_count) {
      return '暂无落地页'
    }
    if (!langs.length) {
      return '未知'
    }
    const unique = Array.from(new Set(langs))
    if (unique.length === 1) {
      const lang = unique[0]
      if (lang === 'en') return '英文'
      if (lang === 'pt') return '葡萄牙语'
      return '中文'
    }
    return '多语言'
  }

  const renderChannelsSummary = (wf: Workflow): string => {
    if (!wf.landing_page_count) {
      return '暂无落地页'
    }
    const channels = wf.channel_names ?? []
    if (!channels.length) {
      return '未选择渠道'
    }
    const unique = Array.from(new Set(channels.filter(Boolean)))
    if (!unique.length) {
      return '未选择渠道'
    }
    if (unique.length <= 2) {
      return unique.join(' / ')
    }
    return `${unique.slice(0, 2).join(' / ')} 等 ${unique.length} 个`
  }

  const columns: ColumnsType<Workflow> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 160,
      render: (_: unknown, record) => {
        const roleText = record.created_by_role
          ? ROLE_LABEL[record.created_by_role] || record.created_by_role
          : ''
        return (
          <span>
            {record.created_by || '-'}
            {roleText ? `（${roleText}）` : ''}
          </span>
        )
      },
    },
    {
      title: '批次名称',
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 260,
      render: (value: WorkflowStatus, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Tag color={WORKFLOW_STATUS_COLOR[value]}>
            {WORKFLOW_STATUS_LABEL[value] ?? value}
          </Tag>
          <span style={{ fontSize: 12, color: '#666' }}>
            广告图：{record.ad_image_count ?? 0} 张 ｜{' '}
            {record.campaign_names && record.campaign_names.length > 0
              ? `已关联投流计划：${record.campaign_names.join(' / ')}`
              : '尚未关联投流计划'}
          </span>
        </div>
      ),
    },
    {
      title: '语言',
      dataIndex: 'languages',
      width: 120,
      render: (_: unknown, record: Workflow) => (
        <span style={{ fontSize: 12, color: '#666' }}>
          {renderLanguagesSummary(record)}
        </span>
      ),
    },
    {
      title: '渠道',
      dataIndex: 'channel_names',
      width: 200,
      render: (_: unknown, record: Workflow) => (
        <span style={{ fontSize: 12, color: '#666' }}>
          {renderChannelsSummary(record)}
        </span>
      ),
    },
    {
      title: '落地页数量',
      dataIndex: 'landing_page_count',
      width: 120,
    },
    {
      title: '最新落地页ID',
      dataIndex: 'latest_landing_page_id',
      width: 140,
      render: (value?: number | null) =>
        value ? (
          <span>{value}</span>
        ) : (
          <span style={{ color: '#999' }}>无</span>
        ),
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      width: 180,
      render: (_: unknown, record) => {
        const roleText = record.created_by_role
          ? ROLE_LABEL[record.created_by_role] || record.created_by_role
          : ''
        return (
          <span>
            {record.created_by || '-'}
            {roleText ? `（${roleText}）` : ''}
          </span>
        )
      },
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
            <Input placeholder="例如：1 月黑五活动 - 视频合集 A" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
