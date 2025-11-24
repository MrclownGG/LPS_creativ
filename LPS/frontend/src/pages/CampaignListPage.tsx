import { Card, Typography } from 'antd'

const { Title, Paragraph } = Typography

export const CampaignListPage: React.FC = () => {
  return (
    <Card>
      <Title level={4}>投放计划</Title>
      <Paragraph>这里将展示投放计划列表以及创建 / 下载投放包的功能。</Paragraph>
      <Paragraph type="secondary">（当前为占位页面，后续里程碑中实现具体功能。）</Paragraph>
    </Card>
  )
}

