import { useState } from 'react'
import {
  Card,
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCampaigns,
  useCreateCampaignMutation,
  useMapCampaignWorkflowsMutation,
  useCampaignChannels,
  useCampaignRegions,
  createCampaignChannel,
  createCampaignRegion,
  getCampaignDetail,
  type Campaign,
  type CampaignDetail,
} from '../api/campaigns'
import { useWorkflows, type Workflow, type WorkflowStatus } from '../api/workflows'

const { Title } = Typography
const { Option } = Select

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

export const CampaignListPage: React.FC = () => {
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  )

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] =
    useState(false)
  const [isCreateRegionModalOpen, setIsCreateRegionModalOpen] =
    useState(false)
  const [isSelectWorkflowModalOpen, setIsSelectWorkflowModalOpen] =
    useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null,
  )
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<number[]>([])
  const [detailData, setDetailData] = useState<CampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [form] = Form.useForm()

  const { data, isLoading } = useCampaigns({
    status: statusFilter,
    page,
    page_size: pageSize,
  })

  const {
    data: readyWorkflows,
    isLoading: readyWorkflowsLoading,
  } = useWorkflows({
    page: 1,
    page_size: 100,
  })

  const createMutation = useCreateCampaignMutation()
  const mapWorkflowsMutation = useMapCampaignWorkflowsMutation()

  const { data: channelDict } = useCampaignChannels()
  const { data: regionDict } = useCampaignRegions()

  const handleOpenCreateModal = () => {
    form.resetFields()
    setIsCreateModalOpen(true)
  }

  const handleCreateFinish = (values: any) => {
    createMutation.mutate(
      {
        name: values.name,
        channels: values.channels || [],
        regions: values.regions || [],
      },
      {
        onSuccess: () => {
          message.success('投放计划创建成功')
          setIsCreateModalOpen(false)
          queryClient.invalidateQueries({ queryKey: ['campaigns'] })
        },
        onError: (error: unknown) => {
          const msg =
            error instanceof Error ? error.message : '创建投放计划失败，请稍后重试'
          message.error(msg)
        },
      },
    )
  }

  const handleOpenSelectWorkflow = (record: Campaign) => {
    setSelectedCampaign(record)
    setSelectedWorkflowIds([])
    setIsSelectWorkflowModalOpen(true)
  }

  const handleOpenDetailModal = async (record: Campaign) => {
    setDetailLoading(true)
    setIsDetailModalOpen(true)
    try {
      const detail = await getCampaignDetail(record.id)
      setDetailData(detail)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '获取投放计划详情失败，请稍后重试'
      message.error(msg)
      setIsDetailModalOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const columns: ColumnsType<Campaign> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '计划名称', dataIndex: 'name', ellipsis: true },
    {
      title: '渠道',
      dataIndex: 'channels',
      render: (channels: string[]) =>
        channels?.length ? channels.join(' / ') : '-',
    },
    {
      title: '地区',
      dataIndex: 'regions',
      render: (regions: string[]) =>
        regions?.length ? regions.join(' / ') : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status: string) => <Tag color="blue">{status || 'active'}</Tag>,
    },
    {
      title: '关联批次数',
      dataIndex: 'workflow_count',
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
      width: 260,
      render: (_, record) => (
        <>
          <Button
            type="link"
            size="small"
            onClick={() => handleOpenDetailModal(record)}
          >
            查看详情
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleOpenSelectWorkflow(record)}
          >
            关联 ready 批次
          </Button>
          <Button type="link" size="small" disabled>
            下载（待实现）
          </Button>
        </>
      ),
    },
  ]

  const workflowColumns: ColumnsType<Workflow> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '批次名称', dataIndex: 'name', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (status: WorkflowStatus) => (
        <Tag color={WORKFLOW_STATUS_COLOR[status]}>
          {WORKFLOW_STATUS_LABEL[status] ?? status}
        </Tag>
      ),
    },
  ]

  return (
    <Card>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 220 }}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value || undefined)}
        >
          <Option value="active">active</Option>
          <Option value="inactive">inactive</Option>
        </Select>
        <Button type="primary" onClick={handleOpenCreateModal}>
          新建投放计划
        </Button>
        <Button onClick={() => setIsCreateChannelModalOpen(true)}>
          新建投放渠道
        </Button>
        <Button onClick={() => setIsCreateRegionModalOpen(true)}>
          新建投放地区
        </Button>
      </div>

      <Table<Campaign>
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
        title="新建投放计划"
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateFinish}>
          <Form.Item
            label="计划名称"
            name="name"
            rules={[{ required: true, message: '请输入计划名称' }]}
          >
            <Input placeholder="例如：Q1-黑五-主推 A 方案" />
          </Form.Item>
          <Form.Item label="投放渠道" name="channels">
            <Select
              mode="multiple"
              placeholder="选择投放渠道（可多选）"
              allowClear
            >
              {(channelDict ?? []).map((ch) => (
                <Option key={ch.code} value={ch.code}>
                  {ch.name}（{ch.code}）
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="投放地区" name="regions">
            <Select
              mode="multiple"
              placeholder="选择投放地区（可多选）"
              allowClear
            >
              {(regionDict ?? []).map((rg) => (
                <Option key={rg.code} value={rg.code}>
                  {rg.name}（{rg.code}）
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建投放渠道"
        open={isCreateChannelModalOpen}
        onCancel={() => setIsCreateChannelModalOpen(false)}
        footer={null}
      >
        <ChannelForm
          onSuccess={async () => {
            setIsCreateChannelModalOpen(false)
            await queryClient.invalidateQueries({
              queryKey: ['campaign-channels'],
            })
          }}
        />
      </Modal>

      <Modal
        title="新建投放地区"
        open={isCreateRegionModalOpen}
        onCancel={() => setIsCreateRegionModalOpen(false)}
        footer={null}
      >
        <RegionForm
          onSuccess={async () => {
            setIsCreateRegionModalOpen(false)
            await queryClient.invalidateQueries({
              queryKey: ['campaign-regions'],
            })
          }}
        />
      </Modal>

      <Modal
        title={
          detailData ? `投放计划详情：${detailData.name}` : '投放计划详情'
        }
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false)
          setDetailData(null)
        }}
        footer={null}
        width={720}
      >
        {detailLoading ? (
          <Typography.Paragraph>加载中...</Typography.Paragraph>
        ) : detailData ? (
          <>
            <Typography.Paragraph>
              ID：{detailData.id} ｜ 状态：
              <Tag color="blue">{detailData.status || 'active'}</Tag>
            </Typography.Paragraph>
            <Typography.Paragraph>
              渠道：{detailData.channels.join(' / ') || '-'}
            </Typography.Paragraph>
            <Typography.Paragraph>
              地区：{detailData.regions.join(' / ') || '-'}
            </Typography.Paragraph>
            <Typography.Paragraph>
              创建人：{detailData.created_by} ｜ 创建时间：
              {detailData.created_at}
            </Typography.Paragraph>
            <Title level={5} style={{ marginTop: 16 }}>
              已关联工作流
            </Title>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: 'ID', dataIndex: 'id', width: 80 },
                { title: '批次名称', dataIndex: 'name', ellipsis: true },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 120,
                  render: (status: string) => {
                    const s = (status || 'draft') as WorkflowStatus
                    return (
                      <Tag color={WORKFLOW_STATUS_COLOR[s]}>
                        {WORKFLOW_STATUS_LABEL[s] ?? s}
                      </Tag>
                    )
                  },
                },
              ]}
              dataSource={detailData.workflows}
            />
          </>
        ) : (
          <Typography.Paragraph>暂无数据</Typography.Paragraph>
        )}
      </Modal>

      <Modal
        title={
          selectedCampaign
            ? `为「${selectedCampaign.name}」选择 ready 批次`
            : '选择 ready 批次'
        }
        open={isSelectWorkflowModalOpen}
        onCancel={() => setIsSelectWorkflowModalOpen(false)}
        onOk={async () => {
          if (!selectedCampaign) {
            setIsSelectWorkflowModalOpen(false)
            return
          }
          try {
            await mapWorkflowsMutation.mutateAsync({
              campaignId: selectedCampaign.id,
              workflowIds: selectedWorkflowIds,
            })
            message.success('关联 ready 批次成功')
            setIsSelectWorkflowModalOpen(false)
            queryClient.invalidateQueries({ queryKey: ['campaigns'] })
          } catch (error) {
            const msg =
              error instanceof Error
                ? error.message
                : '关联 ready 批次失败，请稍后重试'
            message.error(msg)
          }
        }}
        width={720}
        okButtonProps={{ disabled: !selectedCampaign }}
      >
        <Table<Workflow>
          rowKey="id"
          loading={readyWorkflowsLoading}
          columns={workflowColumns}
          dataSource={
            readyWorkflows?.items.filter(
              (w) => w.status === 'ready' || w.status === 'in_use',
            ) ?? []
          }
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedWorkflowIds,
            onChange: (keys) => setSelectedWorkflowIds(keys as number[]),
          }}
          size="small"
        />
      </Modal>
    </Card>
  )
}

interface SimpleFormProps {
  onSuccess: () => void | Promise<void>
}

const ChannelForm: React.FC<SimpleFormProps> = ({ onSuccess }) => {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const handleFinish = async (values: { name: string; code: string }) => {
    setSaving(true)
    try {
      await createCampaignChannel({
        name: values.name.trim(),
        code: values.code.trim(),
      })
      message.success('投放渠道创建成功')
      form.resetFields()
      await onSuccess()
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '创建投放渠道失败，请稍后重试'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish}>
      <Form.Item
        label="渠道名称"
        name="name"
        rules={[{ required: true, message: '请输入渠道名称' }]}
      >
        <Input placeholder="例如：FB 主号" />
      </Form.Item>
      <Form.Item
        label="渠道编码"
        name="code"
        rules={[{ required: true, message: '请输入渠道编码' }]}
      >
        <Input placeholder="例如：FB:28" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          保存
        </Button>
      </Form.Item>
    </Form>
  )
}

const RegionForm: React.FC<SimpleFormProps> = ({ onSuccess }) => {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const handleFinish = async (values: { name: string; code: string }) => {
    setSaving(true)
    try {
      await createCampaignRegion({
        name: values.name.trim(),
        code: values.code.trim(),
      })
      message.success('投放地区创建成功')
      form.resetFields()
      await onSuccess()
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '创建投放地区失败，请稍后重试'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish}>
      <Form.Item
        label="地区名称"
        name="name"
        rules={[{ required: true, message: '请输入地区名称' }]}
      >
        <Input placeholder="例如：北美区" />
      </Form.Item>
      <Form.Item
        label="地区编码"
        name="code"
        rules={[{ required: true, message: '请输入地区编码' }]}
      >
        <Input placeholder="例如：US 或 US-CA" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          保存
        </Button>
      </Form.Item>
    </Form>
  )
}
