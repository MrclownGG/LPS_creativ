import { useState } from 'react'
import {
  Card,
  Button,
  Table,
  Tag,
  Form,
  Input,
  Select,
  Modal,
  App as AntdApp,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQueryClient } from '@tanstack/react-query'
import {
  useUsers,
  useCreateUserMutation,
  useUpdateUserMutation,
  type UserItem,
  type UserRole,
  type UserStatus,
} from '../api/users'

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  operator: '投放人员',
  designer: '美工',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  disabled: 'red',
}

export const UserListPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { message } = AntdApp.useApp()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)

  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const { data, isLoading } = useUsers({
    page,
    page_size: pageSize,
    role: roleFilter,
    status: statusFilter,
  })

  const createMutation = useCreateUserMutation()
  const updateMutation = useUpdateUserMutation()

  const handleOpenCreate = () => {
    createForm.resetFields()
    createForm.setFieldsValue({
      role: 'operator',
      status: 'active',
    })
    setCreateModalOpen(true)
  }

  const handleCreateFinish = async (values: any) => {
    try {
      await createMutation.mutateAsync(values)
      message.success('用户创建成功')
      setCreateModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建失败'
      message.error(msg)
    }
  }

  const handleOpenEdit = (record: UserItem) => {
    setEditingUser(record)
    editForm.setFieldsValue({
      nickname: record.nickname,
      role: record.role,
      status: record.status,
      password: '',
    })
    setEditModalOpen(true)
  }

  const handleEditFinish = async (values: any) => {
    if (!editingUser) return
    try {
      const payload: any = {
        nickname: values.nickname ?? null,
        role: values.role as UserRole,
        status: values.status as UserStatus,
      }
      if (values.password) {
        payload.password = values.password
      }
      await updateMutation.mutateAsync({ id: editingUser.id, payload })
      message.success('用户已更新')
      setEditModalOpen(false)
      setEditingUser(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '更新失败'
      message.error(msg)
    }
  }

  const columns: ColumnsType<UserItem> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '账号', dataIndex: 'username', width: 140 },
    { title: '昵称', dataIndex: 'nickname', width: 140 },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (value: string) => ROLE_LABEL[value] || value,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => (
        <Tag color={STATUS_COLOR[value] || 'default'}>
          {value === 'active' ? '启用' : value === 'disabled' ? '禁用' : value}
        </Tag>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 200 },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 140,
      render: (_, record) => (
        <Button type="link" onClick={() => handleOpenEdit(record)}>
          编辑
        </Button>
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
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Select
          allowClear
          placeholder="按角色筛选"
          style={{ width: 160 }}
          value={roleFilter}
          onChange={(v) => setRoleFilter(v || undefined)}
        >
          <Select.Option value="admin">管理员</Select.Option>
          <Select.Option value="operator">投放人员</Select.Option>
          <Select.Option value="designer">美工</Select.Option>
        </Select>
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 160 }}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v || undefined)}
        >
          <Select.Option value="active">启用</Select.Option>
          <Select.Option value="disabled">禁用</Select.Option>
        </Select>
        <Button type="primary" onClick={handleOpenCreate}>
          新建用户
        </Button>
      </div>

      <Table<UserItem>
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
        title="新建用户"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateFinish}>
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input placeholder="账号" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Form.Item label="昵称" name="nickname">
            <Input placeholder="昵称" />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="operator">投放人员</Select.Option>
              <Select.Option value="designer">美工</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="active">启用</Select.Option>
              <Select.Option value="disabled">禁用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingUser ? `编辑用户：${editingUser.username}` : '编辑用户'}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false)
          setEditingUser(null)
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditFinish}>
          <Form.Item label="账号">
            <Input disabled value={editingUser?.username} />
          </Form.Item>
          <Form.Item label="昵称" name="nickname">
            <Input placeholder="昵称" />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="operator">投放人员</Select.Option>
              <Select.Option value="designer">美工</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="active">启用</Select.Option>
              <Select.Option value="disabled">禁用</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="重置密码"
            name="password"
            extra="留空则不修改密码"
          >
            <Input.Password placeholder="新密码（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
