import { useAuth } from '@clerk/react'
import { Navigate, Outlet } from 'react-router-dom'

export function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth()
  if (!isLoaded) return <div className="grid min-h-screen place-items-center text-neutral-500">Carregando…</div>
  if (!isSignedIn) return <Navigate to="/entrar" replace />
  return <Outlet />
}
