import './App.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { MainLayout } from './layouts/MainLayout'
import { VideoListPage } from './pages/VideoListPage'
import { TemplateListPage } from './pages/TemplateListPage'
import { WorkflowListPage } from './pages/WorkflowListPage'
import { WorkflowGeneratePage } from './pages/WorkflowGeneratePage'
import { WorkflowDetailPage } from './pages/WorkflowDetailPage'
import { CampaignListPage } from './pages/CampaignListPage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677ff',
          },
        }}
      >
        <AntdApp>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/videos" replace />} />
                <Route path="videos" element={<VideoListPage />} />
                <Route path="templates" element={<TemplateListPage />} />
                <Route path="workflows" element={<WorkflowListPage />} />
                <Route
                  path="workflows/:workflowId/generate"
                  element={<WorkflowGeneratePage />}
                />
                <Route
                  path="workflows/:workflowId"
                  element={<WorkflowDetailPage />}
                />
                <Route path="campaigns" element={<CampaignListPage />} />
                <Route path="*" element={<Navigate to="/videos" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

export default App
