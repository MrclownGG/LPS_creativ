 [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
    },
    {
      title: '封面',
      dataIndex: 'poster_url',
      width: 150,
      render: (url: string | null | undefined) =>
        url
          ? (() => {
              const src = /^https?:\/\//i.test(url)
                ? url
                : `${backendBaseUrl}${url}`
              return (
                <img
                  src={src}
                  alt="poster"
                  style={{
                    width: 120,
                    height: 68,
                    objectFit: 'cover',
                    borderRadius: 4,
                  }}
                />
              )
            })()
          : '-',
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 120,
      render: (value: string | null | undefined) =>
        value ? <Tag color="blue">{value}</Tag> : <Tag>未分�?/Tag>,
    },
    {
      title: (
        <span>
          观看量{' '}
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => {
              setViewSort((prev) =>
                prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none',
              )
            }}
          >
            {viewSort === 'none' ? '↑↓' : viewSort === 'desc' ? '�? : '�?}
          </Button>
        </span>
      ),
      dataIndex: 'view_count',
      width: 120,
    },
    {
      title: '获取时间',
      dataIndex: 'updated_at',
      width: 180,
      render: (value: string | null | undefined) =>
        value ? (
          <Tooltip title={value}>
            {dayjs(value).format('YYYY-MM-DD HH:mm')}
          </Tooltip>
        ) : (
          '-'
        ),
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
            onClick={() => handleEdit(record)}
            style={{ paddingLeft: 0 }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => handleChangePoster(record)}
            disabled={uploadPosterMutation.isPending}
          >
            修改封面
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除视频�?{record.title}」吗？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </>
      ),
    },
  ]

  const editModalTitle = editingVideo ? '编辑视频信息' : '手动导入'
  const isEditSubmitting =
    createMutation.isPending || updateMutation.isPending

  return (
    <Card>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Search
          placeholder="按标题或分类搜索"
          allowClear
          enterButton
          onSearch={handleSearch}
          style={{ width: 320 }}
        />
        <Button type="primary" onClick={handleCreate}>
          手动导入
        </Button>
        <Button onClick={handleOpenSyncModal}>�?API 导入</Button>
      </div>

      <Table<Video>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filteredItems}
        size="small"
        style={{ fontSize: 13 }}
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
        title={editModalTitle}
        open={isEditModalOpen}
        onCancel={handleEditModalCancel}
        onOk={() => editForm.submit()}
        confirmLoading={isEditSubmitting}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditFormFinish}
          initialValues={{ view_count: 0 }}
        >
          <Form.Item label="外部视频 ID（可选）" name="external_id">
            <Input placeholder="例如外部系统�?video_id，可留空" />
          </Form.Item>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请输入视频标�? }]}
          >
            <Input placeholder="请输入视频标�? />
          </Form.Item>
          <Form.Item label="分类" name="category">
            <Input placeholder="例如 tutorial、promo 等，可留�? />
          </Form.Item>
          <Form.Item
            label="封面�?URL"
            name="poster_url"
            rules={[{ required: true, message: '请输入封面图 URL' }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item
            label="观看�?
            name="view_count"
            rules={[{ type: 'number', min: 0, message: '观看量不能为负数' }]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="�?API 导入视频"
        open={isSyncModalOpen}
        onCancel={() => setIsSyncModalOpen(false)}
        onOk={() => syncForm.submit()}
        confirmLoading={syncMutation.isPending}
      >
        <Form
          form={syncForm}
          layout="vertical"
          onFinish={handleSyncFormFinish}
        >
          <Form.Item
            label="数据来源"
            name="source"
            rules={[{ required: true, message: '请选择数据来源' }]}
          >
            <Select
              options={[
                {
                  label: 'STCine 热门排行',
                  value: 'stcine',
                },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="日期范围"
            name="dateRange"
            rules={[{ required: true, message: '请选择日期范围' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="同步条数（limit�?
            name="limit"
            rules={[
              {
                type: 'number',
                min: 1,
                max: 500,
                message: '请输�?1-500 之间的数',
              },
            ]}
          >
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}


