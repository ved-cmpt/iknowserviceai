// Helpers for admin-only read endpoints.
import { withQuery } from './client'

export function auditPath(params) {
  return withQuery('/admin/audit', params)
}
