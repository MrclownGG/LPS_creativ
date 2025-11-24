import { Layout, Menu, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Header, Sider, Content } = Layout
const { Title } = Typography

type MenuItem = Required<MenuProps>['items'][number]

const items: MenuItem[] = [
  {
    key: '/videos',
    label: '影片素材库',
  },
  {
    key: '/templates',
    label: '模板管理',
  },
  {
    key: '/workflows',
    label: '落地页生成',
  },
  {
    key: '/campaigns',
    label: '投放计划',
  },
]

export const MainLayout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  const selectedKey =
    items.find((item) =>
      location.pathname.startsWith((item as any).key as string),
    )?.key ?? '/videos'

  const handleMenuClick: MenuProps['onClick'] = (info) => {
    navigate(info.key)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="dark">
        <div
          style={{
            height: 48,
            margin: 16,
            color: '#fff',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          LPS Creativ
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[selectedKey as string]}
          items={items}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            paddingInline: 24,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Title level={3} style={{ margin: 0 }}>
            FB 落地页生成系统
          </Title>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
