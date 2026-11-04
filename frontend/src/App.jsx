import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/authContext'
import ProtectedRoute from './auth/ProtectedRoute'
import RoleRoute from './auth/RoleRoute'
import { ADMIN_ROLES, homeFor, STAFF_ROLES } from './auth/roles'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import KnowledgeArticlePage from './pages/KnowledgeArticlePage'
import KnowledgeListPage from './pages/KnowledgeListPage'
import LoginPage from './pages/LoginPage'
import NewRequestPage from './pages/NewRequestPage'
import NotFoundPage from './pages/NotFoundPage'
import RequestDetailPage from './pages/RequestDetailPage'

function Upcoming({ title }) {
  return <h1>{title}</h1>
}

function Home() {
  const { user } = useAuth()
  return <Navigate to={homeFor(user)} replace />
}

// The not-found page keeps the app shell for signed-in users.
function OptionalLayout() {
  const { user } = useAuth()
  if (user) return <Layout />
  return (
    <main className="page page-narrow">
      <Outlet />
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/requests/new" element={<NewRequestPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/knowledge" element={<KnowledgeListPage />} />
          <Route path="/knowledge/:id" element={<KnowledgeArticlePage />} />
          <Route element={<RoleRoute allow={STAFF_ROLES} />}>
            <Route path="/support" element={<Upcoming title="Support queue" />} />
            <Route path="/support/:id" element={<Upcoming title="Support request" />} />
          </Route>
          <Route element={<RoleRoute allow={ADMIN_ROLES} />}>
            <Route path="/admin/knowledge" element={<Upcoming title="Knowledge admin" />} />
            <Route path="/admin/audit" element={<Upcoming title="Audit log" />} />
          </Route>
        </Route>
      </Route>
      <Route element={<OptionalLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
