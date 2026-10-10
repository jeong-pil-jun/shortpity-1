import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** Route guard: sends signed-out visitors to /login and brings them back afterwards */
export default function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="container page empty">Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ next: location.pathname, nextState: location.state }} />
  return <Outlet />
}
