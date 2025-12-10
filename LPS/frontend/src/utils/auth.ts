export type AuthUser = {
  id: number
  username: string
  nickname?: string | null
  role?: string | null
  status?: string | null
}

const TOKEN_KEY = 'lps_token'
const USER_KEY = 'lps_user'

export const getToken = (): string | null => {
  return window.localStorage.getItem(TOKEN_KEY)
}

export const setToken = (token: string): void => {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = (): void => {
  window.localStorage.removeItem(TOKEN_KEY)
}

export const getStoredUser = (): AuthUser | null => {
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch (err) {
    console.error('parse stored user failed', err)
    return null
  }
}

export const setStoredUser = (user: AuthUser | null): void => {
  if (!user) {
    window.localStorage.removeItem(USER_KEY)
    return
  }
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const clearAuthStorage = (): void => {
  clearToken()
  setStoredUser(null)
}

export const isLoggedIn = (): boolean => {
  return !!getToken()
}
