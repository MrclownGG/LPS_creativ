import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isLoggedIn } from '../utils/auth'

interface RequireAuthProps {
  children: React.ReactElement
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const location = useLocation()

  if (!isLoggedIn()) {
    const redirect = encodeURIComponent(
      location.pathname + location.search + location.hash,
    )
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  return children
}
