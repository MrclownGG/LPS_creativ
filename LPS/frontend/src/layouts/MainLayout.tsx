import { Layout, Menu, Typography, Button, Tag } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clearAuthStorage, getStoredUser } from '../utils/auth'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography

type MenuItem = Required<MenuProps>['items'][number]

export const MainLayout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = getStoredUser()

  const roleLabel: Record<string, string> = {
    admin: '管理员',
    operator: '投放人员',
    designer: '美工',
  }

  const items: MenuItem[] = [
    { key: '/videos', label: '视频素材库' },
    { key: '/templates', label: '模板管理' },
    { key: '/workflows', label: '落地页生成' },
    { key: '/campaigns', label: '投放计划' },
    ...(currentUser?.role === 'admin'
      ? [{ key: '/users', label: '用户管理' } as MenuItem]
      : []),
  ]

  const selectedKey =
    items.find((item) =>
      location.pathname.startsWith((item as any).key as string),
    )?.key ?? '/videos'

  const handleMenuClick: MenuProps['onClick'] = (info) => {
    navigate(info.key)
  }

  const handleLogout = () => {
    clearAuthStorage()
    navigate('/login', { replace: true })
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
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Text>
              {currentUser?.nickname || currentUser?.username || '未登录用户'}
            </Text>
            {currentUser?.role && (
              <Tag color="blue">
                {roleLabel[currentUser.role] || currentUser.role}
              </Tag>
            )}
            <Button type="link" onClick={handleLogout}>
              退出
            </Button>
          </div>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
