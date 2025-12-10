import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Typography,
} from 'antd'
import { login } from '../api/auth'
import { clearAuthStorage, setStoredUser, setToken } from '../utils/auth'

const { Title, Paragraph } = Typography

export const LoginPage: React.FC = () => {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // 进入登录页时先清理旧的登录态，避免脏数据
    clearAuthStorage()
  }, [])

  const handleFinish = async (values: { username: string; password: string }) => {
    setLoading(true)
    try {
      const data = await login(values)
      setToken(data.access_token)
      setStoredUser(data.user)
      message.success('登录成功')
      const redirect = searchParams.get('redirect')
      navigate(redirect && redirect.startsWith('/') ? redirect : '/videos', {
        replace: true,
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '登录失败，请检查账号或密码'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          LPS Creativ
        </Title>
        <Paragraph style={{ textAlign: 'center', color: '#666' }}>
          登录后继续使用落地页生成与投放管理
        </Paragraph>
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input placeholder="请输入账号" autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            style={{ marginTop: 8 }}
          >
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
