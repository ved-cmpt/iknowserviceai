import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/authContext'
import ProtectedRoute from './auth/ProtectedRoute'
import RoleRoute from './auth/RoleRoute'
import { ADMIN_ROLES, homeFor, STAFF_ROLES } from './auth/roles'
import Layout from './components/Layout'
import LoadingState from './components/LoadingState'
import AdminArticleEditorPage from './pages/AdminArticleEditorPage'
import AdminAuditPage from './pages/AdminAuditPage'
import AdminKnowledgePage from './pages/AdminKnowledgePage'
import DashboardPage from './pages/DashboardPage'
import KnowledgeArticlePage from './pages/KnowledgeArticlePage'
import KnowledgeListPage from './pages/KnowledgeListPage'
import LoginPage from './pages/LoginPage'
import NewRequestPage from './pages/NewRequestPage'
import NotFoundPage from './pages/NotFoundPage'
import RequestDetailPage from './pages/RequestDetailPage'
import SupportDetailPage from './pages/SupportDetailPage'
import SupportQueuePage from './pages/SupportQueuePage'

function Home() {
  const { user, restoring } = useAuth()
  if (restoring) {
    return (
      <main className="page">
        <LoadingState label="Loading…" />
      </main>
    )
  }
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
            <Route path="/support" element={<SupportQueuePage />} />
            <Route path="/support/:id" element={<SupportDetailPage />} />
          </Route>
          <Route element={<RoleRoute allow={ADMIN_ROLES} />}>
            <Route path="/admin/knowledge" element={<AdminKnowledgePage />} />
            <Route path="/admin/knowledge/new" element={<AdminArticleEditorPage />} />
            <Route path="/admin/knowledge/:id/edit" element={<AdminArticleEditorPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
          </Route>
        </Route>
      </Route>
      <Route element={<OptionalLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
