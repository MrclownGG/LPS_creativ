import { useMemo, useState } from 'react'
import {
  Alert,
  Card,
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  App as AntdApp,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api/client'
import {
  useCampaigns,
  useCreateCampaignMutation,
  getCampaignDetail,
  bindCampaignChannel,
  bindCampaignLandingPage,
  deployCampaignLandingPage,
  type Campaign,
  type CampaignDetail,
  type CampaignLandingPageSource,
} from '../api/campaigns'
import {
  useChannels,
  fetchChannelToken,
  type ChannelTokenData,
} from '../api/channels'

const { Title, Paragraph, Text } = Typography
const { Option } = Select

export const CampaignListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { modal, message } = AntdApp.useApp()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  )

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null,
  )
  const [selectedLandingPageId, setSelectedLandingPageId] = useState<
    number | null
  >(null)
  const [detailData, setDetailData] = useState<CampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [bindingChannelId, setBindingChannelId] = useState<number | undefined>(
    undefined,
  )
  const [bindingTokenInfo, setBindingTokenInfo] =
    useState<ChannelTokenData | null>(null)
  const [bindingTokenAlert, setBindingTokenAlert] = useState<{
    status: 'success' | 'error'
    message: string
  } | null>(null)
  const [bindingLoading, setBindingLoading] = useState(false)
  const [tokenFetching, setTokenFetching] = useState(false)
  const [generatingLandingPage, setGeneratingLandingPage] = useState(false)

  const [form] = Form.useForm()

  const { data, isLoading } = useCampaigns({
    status: statusFilter,
    page,
    page_size: pageSize,
  })

  const createMutation = useCreateCampaignMutation()

  const {
    data: channelList,
    isLoading: channelListLoading,
    isFetching: channelListFetching,
  } = useChannels()

  const backendBaseUrl = useMemo(
    () => apiClient.defaults.baseURL?.replace(/\/api\/?$/, '') ?? '',
    [],
  )
  const channelOptions = channelList?.items ?? []
  const channelSelectLoading = channelListLoading || channelListFetching
  const selectedLandingPage = useMemo(() => {
    if (!detailData || !selectedLandingPageId) return null
    return detailData.landing_pages.find((lp) => lp.id === selectedLandingPageId) ?? null
  }, [detailData, selectedLandingPageId])
  const handleOpenCreateModal = () => {
    form.resetFields()
    setIsCreateModalOpen(true)
  }

  const handleFetchBindingToken = async () => {
    if (!bindingChannelId) {
      message.warning('请先选择渠道')
      return
    }
    setTokenFetching(true)
    try {
      const data = await fetchChannelToken(bindingChannelId)
      setBindingTokenInfo(data)
      setBindingTokenAlert({
        status: 'success',
        message: `已获取渠道 ${data.channel_code} 的 token`,
      })
      message.success('渠道 token 获取成功')
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '当前渠道的 token 不存在'
      setBindingTokenInfo(null)
      setBindingTokenAlert({
        status: 'error',
        message: msg,
      })
      message.error(msg)
    } finally {
      setTokenFetching(false)
    }
  }

  const handleSaveBinding = async () => {
    if (!selectedCampaign) {
      message.warning('请先选择投放计划')
      return
    }
    if (!bindingChannelId) {
      message.warning('请选择渠道')
      return
    }
    setBindingLoading(true)
    try {
      await bindCampaignChannel(selectedCampaign.id, {
        channel_id: bindingChannelId,
        token: bindingTokenInfo?.token,
        external_channel_id: bindingTokenInfo?.external_channel_id ?? undefined,
      })
      message.success('渠道配置已保存')
      const detail = await getCampaignDetail(selectedCampaign.id)
      setDetailData(detail)
      setBindingChannelId(detail.channel_binding?.channel_id ?? bindingChannelId)
      setSelectedLandingPageId(detail.selected_landing_page_id ?? null)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '保存渠道配置失败，请稍后重试'
      message.error(msg)
    } finally {
      setBindingLoading(false)
    }
  }

  const handleSaveLandingPageBinding = async () => {
    if (!selectedCampaign) {
      message.warning('请先选择投放计划')
      return
    }
    if (!selectedLandingPageId) {
      message.warning('请选择一个落地页')
      return
    }
    try {
      await bindCampaignLandingPage(selectedCampaign.id, selectedLandingPageId)
      message.success('关联落地页成功')
      modal.success({
        title: '保存成功',
        content: '已将当前落地页绑定到该投放计划，可以直接生成投放版。',
      })
      const detail = await getCampaignDetail(selectedCampaign.id)
      setDetailData(detail)
      setSelectedLandingPageId(detail.selected_landing_page_id ?? selectedLandingPageId)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : '关联落地页失败，请稍后重试'
      message.error(msg)
    }
  }

  const handleGenerateSelectedLandingPage = async () => {
    if (!selectedCampaign) {
      modal.warning({
        title: '缺少投放计划',
        content: '请先选择一个投放计划后再生成投放版本。',
      })
      return
    }
    if (!detailData?.channel_binding) {
      modal.warning({
        title: '缺少渠道配置',
        content: '请在上方先保存渠道 + token，再生成投放版本。',
      })
      return
    }
    if (!selectedLandingPageId) {
      modal.warning({
        title: '缺少落地页',
        content: '请先在下方表格中选择并保存落地页，再生成投放版本。',
      })
      return
    }
    setGeneratingLandingPage(true)
    try {
      await deployCampaignLandingPage(
        selectedCampaign.id,
        selectedLandingPageId,
      )
      modal.success({
        title: '投放版本生成成功',
        content: '已根据当前落地页生成投放版，下面的列表可以查看链接与离线包。',
      })
      const detail = await getCampaignDetail(selectedCampaign.id)
      setDetailData(detail)
      setSelectedLandingPageId(detail.selected_landing_page_id ?? null)
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : '生成投放落地页失败，请稍后重试'
      message.error(msg)
    } finally {
      setGeneratingLandingPage(false)
    }
  }

  const handleCreateFinish = (values: any) => {
    createMutation.mutate(
      { name: values.name },
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

  const handleOpenDetailModal = async (record: Campaign) => {
    setSelectedCampaign(record)
    setDetailLoading(true)
    setIsDetailModalOpen(true)
    setBindingTokenInfo(null)
    setBindingTokenAlert(null)
    setBindingChannelId(undefined)
    setSelectedLandingPageId(null)
    try {
      const detail = await getCampaignDetail(record.id)
      setDetailData(detail)
      setBindingChannelId(detail.channel_binding?.channel_id ?? undefined)
      setSelectedLandingPageId(detail.selected_landing_page_id ?? null)
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
      dataIndex: 'bound_channel_name',
      width: 220,
      render: (_: unknown, record) =>
        record.bound_channel_name ? (
          <Text>{record.bound_channel_name}</Text>
        ) : (
          <Text type="secondary">未绑定</Text>
        ),
    },
    {
      title: '落地页ID',
      dataIndex: 'selected_landing_page_id',
      width: 140,
      render: (value: number | null | undefined) =>
        value ? <Text>{value}</Text> : <Text type="secondary">无</Text>,
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
      width: 160,
      render: (_, record) => (
        <>
          <Button
            type="link"
            size="small"
            onClick={() => handleOpenDetailModal(record)}
          >
            查看详情
          </Button>
        </>
      ),
    },
  ]

  const landingSelectionColumns: ColumnsType<CampaignLandingPageSource> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '工作流', dataIndex: 'workflow_id', width: 100 },
    { title: '模板', dataIndex: 'template_id', width: 100 },
    { title: '语言', dataIndex: 'language', width: 120 },
    {
      title: '预览链接',
      dataIndex: 'generated_page_url',
      render: (url: string) =>
        url ? (
          <a href={`${backendBaseUrl}${url}`} target="_blank" rel="noreferrer">
            预览
          </a>
        ) : (
          '-'
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
        </Form>
      </Modal>

      <Modal
        title={
          detailData ? `投放计划详情：${detailData.name}` : '投放计划详情'
        }
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false)
          setDetailData(null)
          setBindingChannelId(undefined)
          setBindingTokenInfo(null)
          setBindingTokenAlert(null)
          setSelectedLandingPageId(null)
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
              创建人：{detailData.created_by} ｜ 创建时间：
              {detailData.created_at}
            </Typography.Paragraph>
            <Title level={5} style={{ marginTop: 16 }}>
              渠道绑定与 token
            </Title>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }} size={12}>
              <Select
                showSearch
                allowClear
                placeholder={
                  channelOptions.length === 0 ? '暂无渠道' : '请选择渠道'
                }
                optionFilterProp="children"
                style={{ minWidth: 240 }}
                value={bindingChannelId}
                loading={channelSelectLoading}
                onChange={(value) =>
                  setBindingChannelId(
                    typeof value === 'number' ? value : undefined,
                  )
                }
              >
                {channelOptions.map((channel) => (
                  <Option key={channel.id} value={channel.id}>
                    {channel.name}（ID：{channel.id}）
                  </Option>
                ))}
              </Select>
              <Button
                onClick={handleFetchBindingToken}
                disabled={!bindingChannelId}
                loading={tokenFetching}
              >
                查询 token
              </Button>
              <Button
                type="primary"
                onClick={handleSaveBinding}
                loading={bindingLoading}
                disabled={!bindingChannelId}
              >
                保存为计划渠道
              </Button>
            </Space>
            {bindingTokenAlert && (
              <Alert
                type={bindingTokenAlert.status}
                showIcon
                message={bindingTokenAlert.message}
                style={{ marginBottom: 12 }}
              />
            )}
            {bindingTokenInfo && (
              <Card
                size="small"
                style={{
                  background: '#fafafa',
                  borderStyle: 'dashed',
                  marginBottom: 12,
                }}
              >
                <Paragraph style={{ marginBottom: 4 }}>
                  渠道 ID：<Text strong>{bindingTokenInfo.channel_id}</Text>
                </Paragraph>
                <Paragraph style={{ marginBottom: 4 }}>
                  渠道编码：{bindingTokenInfo.channel_code}
                </Paragraph>
                {bindingTokenInfo.external_channel_id && (
                  <Paragraph style={{ marginBottom: 4 }}>
                    渠道 c_id：{bindingTokenInfo.external_channel_id}
                  </Paragraph>
                )}
                <Paragraph copyable={{ text: bindingTokenInfo.token }}>
                  Token：
                  <Text code style={{ wordBreak: 'break-all' }}>
                    {bindingTokenInfo.token}
                  </Text>
                </Paragraph>
              </Card>
            )}
            {detailData.channel_binding ? (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Paragraph style={{ marginBottom: 4 }}>
                  当前绑定渠道：
                  <Text strong>
                    {detailData.channel_binding.channel_name}（ID：
                    {detailData.channel_binding.channel_id}）
                  </Text>
                </Paragraph>
                {detailData.channel_binding.external_channel_id && (
                  <Paragraph style={{ marginBottom: 4 }}>
                    渠道 c_id：{detailData.channel_binding.external_channel_id}
                  </Paragraph>
                )}
                {detailData.channel_binding.updated_at && (
                  <Paragraph style={{ marginBottom: 0 }}>
                    更新时间：{detailData.channel_binding.updated_at}
                  </Paragraph>
                )}
              </Card>
            ) : (
              <Alert
                type="info"
                showIcon
                message="尚未保存渠道配置，请先选择渠道并保存。"
                style={{ marginBottom: 16 }}
              />
            )}
            <Title level={5} style={{ marginTop: 16 }}>
              关联落地页（单选）
            </Title>
            <div className="campaign-detail-scroll-block">
              <Table<CampaignLandingPageSource>
                rowKey="id"
                size="small"
                pagination={false}
                columns={landingSelectionColumns}
                dataSource={detailData.landing_pages}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedLandingPageId
                    ? [selectedLandingPageId]
                    : [],
                  onChange: (keys) => {
                    const key = keys[0]
                    if (key === undefined || key === null) {
                      setSelectedLandingPageId(null)
                      return
                    }
                    setSelectedLandingPageId(typeof key === 'number' ? key : Number(key))
                  },
                }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <Text type="secondary">
                投流计划同一时间只能绑定一个落地页，保存后可随时切换。
              </Text>
              <Button
                type="primary"
                onClick={handleSaveLandingPageBinding}
                disabled={!selectedCampaign || !selectedLandingPageId}
              >
                保存关联落地页
              </Button>
            </div>
            {selectedLandingPage ? (
              <Card size="small" style={{ marginTop: 12 }}>
                <Paragraph style={{ marginBottom: 4 }}>
                  当前落地页：<Text strong>#{selectedLandingPage.id}</Text>
                </Paragraph>
                <Paragraph style={{ marginBottom: 4 }}>
                  工作流 #{selectedLandingPage.workflow_id} ｜ 模板{' '}
                  {selectedLandingPage.template_id}
                </Paragraph>
                <Paragraph style={{ marginBottom: 0 }}>
                  语言：{selectedLandingPage.language}
                </Paragraph>
              </Card>
            ) : (
              <Alert
                type="info"
                showIcon
                message="暂未选择落地页，请在上方表格中单选后保存。"
                style={{ marginTop: 12 }}
              />
            )}
            <Button
              type="primary"
              block
              style={{ marginTop: 12 }}
              onClick={handleGenerateSelectedLandingPage}
              loading={generatingLandingPage}
              disabled={!detailData?.channel_binding || !selectedLandingPageId}
            >
              使用当前落地页生成投放版
            </Button>
            <Title level={5} style={{ marginTop: 16 }}>
              已生成投放落地页
            </Title>
            {detailData.deployed_pages.length > 0 ? (
              <div className="campaign-detail-deployed-grid">
                {detailData.deployed_pages.map((page) => (
                  <Card
                    key={page.id}
                    size="small"
                    className="campaign-detail-deployed-card"
                  >
                    <div className="campaign-detail-deployed-info">
                      <div>
                        <Text strong>落地页 #{page.landing_page_id}</Text>
                        <Text type="secondary" style={{ marginLeft: 8 }}>
                          Workflow #{page.workflow_id} · 模板 {page.template_id}
                        </Text>
                      </div>
                      <div className="campaign-detail-deployed-meta">
                        <span>生成时间：{page.generated_at || '-'}</span>
                        {page.channel_external_id && (
                          <span>渠道 c_id：{page.channel_external_id}</span>
                        )}
                      </div>
                    </div>
                    <div className="campaign-detail-deployed-actions">
                      <Button
                        type="primary"
                        ghost
                        size="small"
                        href={
                          page.page_url
                            ? `${backendBaseUrl}${page.page_url}`
                            : undefined
                        }
                        target={page.page_url ? '_blank' : undefined}
                        rel={page.page_url ? 'noreferrer' : undefined}
                        disabled={!page.page_url}
                      >
                        投放预览
                      </Button>
                      <Button
                        size="small"
                        href={
                          page.package_url
                            ? `${backendBaseUrl}${page.package_url}`
                            : undefined
                        }
                        target={page.package_url ? '_blank' : undefined}
                        rel={page.package_url ? 'noreferrer' : undefined}
                        disabled={!page.package_url}
                      >
                        下载离线包
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="暂未生成投放落地页"
                style={{ marginTop: 8 }}
              />
            )}
          </>
        ) : (
          <Typography.Paragraph>暂无数据</Typography.Paragraph>
        )}
      </Modal>

    </Card>
  )
}

