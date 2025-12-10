import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Typography,
  Select,
} from 'antd'
import { register } from '../api/auth'
import { setStoredUser, setToken, clearAuthStorage } from '../utils/auth'

const { Title, Paragraph } = Typography

export const RegisterPage: React.FC = () => {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)

  const handleFinish = async (values: {
    username: string
    password: string
    confirm: string
    nickname?: string
    role?: string
  }) => {
    if (values.password !== values.confirm) {
      message.error('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const data = await register({
        username: values.username,
        password: values.password,
        nickname: values.nickname,
        role: values.role || 'operator',
      })
      clearAuthStorage()
      setToken(data.access_token)
      setStoredUser(data.user)
      message.success('注册并登录成功')
      const redirect = searchParams.get('redirect')
      navigate(redirect && redirect.startsWith('/') ? redirect : '/videos', {
        replace: true,
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '注册失败，请稍后重试'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
          注册账号
        </Title>
        <Paragraph style={{ textAlign: 'center', color: '#666' }}>
          创建账号后将自动登录
        </Paragraph>
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input placeholder="请输入账号" autoComplete="username" />
          </Form.Item>
          <Form.Item label="昵称" name="nickname">
            <Input placeholder="可选，显示昵称" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              placeholder="请输入密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirm"
            rules={[{ required: true, message: '请再次输入密码' }]}
          >
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>
          <Form.Item label="角色" name="role" initialValue="operator">
            <Select>
              <Select.Option value="operator">投放人员</Select.Option>
              <Select.Option value="designer">美工</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            style={{ marginTop: 8 }}
          >
            注册并登录
          </Button>
          <Button
            type="link"
            block
            style={{ marginTop: 4 }}
            onClick={() => navigate('/login')}
          >
            已有账号？去登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
