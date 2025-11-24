import { useParams } from 'react-router-dom'
import { Card, Typography, Table, Tag, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useWorkflowDetail, type LandingPage, type WorkflowStatus } from '../api/workflows'

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
  const params = useParams<{ workflowId: string }>()
  const workflowId = Number(params.workflowId)

  const { data, isLoading, error } = useWorkflowDetail(
    Number.isFinite(workflowId) ? workflowId : undefined,
  )

  const columns: ColumnsType<LandingPage> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '模板 ID', dataIndex: 'template_id', width: 100 },
    {
      title: '视频 ID 列表',
      dataIndex: 'selected_video_ids',
      render: (ids: number[]) => ids?.join(', '),
    },
    {
      title: '生成页面 URL',
      dataIndex: 'generated_page_url',
      ellipsis: true,
    },
  ]

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
            ID：{data.id}，创建人：{data.created_by}，创建时间：{data.created_at}
          </Paragraph>
          <Paragraph>
            当前状态：
            <Tag color={WORKFLOW_STATUS_COLOR[data.status]}>
              {WORKFLOW_STATUS_LABEL[data.status]}
            </Tag>
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
        </>
      )}
    </Card>
  )
}

