import { AuthenticateWithRedirectCallback } from '@clerk/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/app/AppLayout'
import { ProtectedRoute } from './components/app/ProtectedRoute'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Landing from './pages/Landing'
import LinkTelegram from './pages/LinkTelegram'
import Progress from './pages/Progress'
import Routine from './pages/Routine'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/entrar" element={<Auth mode="login" />} />
        <Route path="/cadastro" element={<Auth mode="signup" />} />
        <Route
          path="/sso-callback"
          element={<AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/app" signUpFallbackRedirectUrl="/vincular" />}
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/vincular" element={<LinkTelegram />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="treinos" element={<Routine />} />
            <Route path="historico" element={<History />} />
            <Route path="progresso" element={<Progress />} />
            <Route path="configuracoes" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
