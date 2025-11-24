import { useState } from 'react'
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
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation } from '@tanstack/react-query'
import { useVideos, type Video } from '../api/videos'
import { useTemplates, type Template } from '../api/templates'
import { apiClient } from '../api/client'
import { generateWorkflow, previewWorkflow } from '../api/workflows'

const { Title, Paragraph } = Typography

export const WorkflowGeneratePage: React.FC = () => {
  const { modal } = App.useApp()
  const navigate = useNavigate()
  const params = useParams<{ workflowId: string }>()
  const workflowId = Number(params.workflowId)

  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([])

  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

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

  const generateMutation = useMutation({
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

  const videoColumns: ColumnsType<Video> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 120 },
  ]

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

  // 本地校验：检查选择的视频数量是否满足所选模板的 max_videos 要求
  // 如果校验不通过，会通过 modal 弹窗给出提示，并阻止后续请求
  const validateSelection = (): boolean => {
    if (!canGenerate) {
      modal.warning({
        title: '无法生成落地页',
        content: '请至少选择 1 个视频和 1 个模板。',
      })
      return false
    }

    const templates = templateData?.items ?? []
    // AntD Table 的 selectedRowKeys 在运行时可能是 string[]，
    // 这里统一转成数字集合，避免类型不一致导致匹配失败
    const selectedIdSet = new Set(selectedTemplateIds.map((id) => Number(id)))
    const selectedTemplates = templates.filter((t) =>
      selectedIdSet.has(Number(t.id)),
    )

    if (selectedTemplates.length === 0) {
      modal.error({
        title: '无法生成落地页',
        content: '选中的模板不存在，请刷新页面后重试。',
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
        content: '当前预览仅支持单个模板，请只勾选 1 个模板。',
      })
      return
    }
    const templateId = selectedTemplateIds[0]
    previewMutation.mutate(templateId)
  }

  const backendBaseUrl =
    apiClient.defaults.baseURL?.replace(/\/api\/?$/, '') ?? ''

  return (
    <Card>
      <Title level={4}>生成落地页</Title>
      <Paragraph>
        工作流 ID：{workflowId}。请选择要使用的视频素材和模板，然后点击下方按钮生成落地页。
      </Paragraph>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={5}>Step 1：选择视频素材</Title>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message="提示：已勾选的视频数量必须不少于所选模板中最大的 max_videos 要求，否则无法生成。"
          />
          <Table<Video>
            rowKey="id"
            loading={videosLoading}
            columns={videoColumns}
            dataSource={videoData?.items ?? []}
            rowSelection={{
              selectedRowKeys: selectedVideoIds,
              onChange: (keys) => setSelectedVideoIds(keys as number[]),
            }}
            pagination={false}
            size="small"
          />
        </div>

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

        <div>
          <Button
            type="primary"
            disabled={!canGenerate}
            loading={generateMutation.isPending}
            onClick={() => {
              if (!validateSelection()) return
              generateMutation.mutate()
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
              请至少选择 1 个视频和 1 个模板。
            </span>
          )}
        </div>
      </Space>

      <Modal
        title="落地页预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width="80%"
        style={{ top: 40 }}
        destroyOnClose
      >
        {previewUrl && (
          <iframe
            src={`${backendBaseUrl}${previewUrl}`}
            style={{ width: '100%', height: '70vh', border: 'none' }}
          />
        )}
      </Modal>
    </Card>
  )
}
