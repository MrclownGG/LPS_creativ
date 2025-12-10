import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getStoredUser } from '../utils/auth'

interface RequireAdminProps {
  children: React.ReactElement
}

export const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const location = useLocation()
  const user = getStoredUser()

  if (user?.role !== 'admin') {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/videos?no_permission=1&redirect=${redirect}`} replace />
  }

  return children
}
