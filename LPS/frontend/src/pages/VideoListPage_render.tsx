
            <Card
              key={video.id}
              hoverable
              bodyStyle={{ padding: 12 }}
              style={{ fontSize: 13 }}
            >
              <div
                style={{
                  width: '100%',
                  height: 220,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: src ? 'pointer' : 'default',
                }}
                onClick={() => src && handleThumbClick(video)}
              >
                {src && (
                  <img
                    src={src}
                    alt={video.title}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontWeight: 500,
                  fontSize: 14,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={video.title}
              >
                {video.title}
              </div>
              <div
                style={{
                  marginTop: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  {video.category ? (
                    <Tag color="blue" style={{ marginRight: 0 }}>
                      {video.category}
                    </Tag>
                  ) : (
                    <Tag style={{ marginRight: 0 }}>未分�?/Tag>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  播放量：{video.view_count}
                </div>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                获取时间：{updatedText}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleEdit(video)}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleChangePoster(video)}
                  disabled={uploadPosterMutation.isPending}
                >
                  修改封面
                </Button>
                <Popconfirm
                  title="确认删除"
                  description={`确定要删除视频�?{video.title}」吗？`}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{
                    danger: true,
                    loading: deleteMutation.isPending,
                  }}
                  onConfirm={() => deleteMutation.mutate(video.id)}
                >
                  <Button danger size="small">
                    删除
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          )
        })}
      </div>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        {/* 简单分页控制：只做页码和每页数量切�?*/}
        <span style={{ marginRight: 12, fontSize: 12, color: '#999' }}>
          �?{data?.total ?? 0} �?        </span>
        <Button
          size="small"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          上一�?        </Button>
        <span style={{ margin: '0 8px', fontSize: 12 }}>
          �?{page} �?        </span>
        <Button
          size="small"
          disabled={
            !data || page * pageSize >= (data?.total ?? 0)
          }
          onClick={() => setPage((p) => p + 1)}
        >
          下一�?        </Button>
      </div>

      <Modal
        title={editingVideo ? '编辑视频信息' : '手动导入'}
        open={isEditModalOpen}
        onCancel={handleEditModalCancel}
        onOk={() => editForm.submit()}
        confirmLoading={
          createMutation.isPending || updateMutation.isPending
        }
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
            <Input placeholder="https://... �?/generated/..." />
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

      <Modal
        title="封面预览"
        open={previewVisible}
        footer={null}
        width={800}
        onCancel={() => setPreviewVisible(false)}
      >
        {previewImageUrl && (
          <img
            src={previewImageUrl}
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto',
            }}
          />
        )}
      </Modal>
    </Card>
  )
}

