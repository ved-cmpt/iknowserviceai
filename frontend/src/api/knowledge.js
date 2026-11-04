// Helpers for knowledge search and article administration.
import { apiFetch, withQuery } from './client'

export function knowledgePath(params) {
  return withQuery('/knowledge', params)
}

export function articlePath(id) {
  return `/knowledge/${encodeURIComponent(id)}`
}

export function adminKnowledgePath(params) {
  return withQuery('/admin/knowledge', params)
}

/** @param {{ slug: string, title: string, body_markdown: string, category: string, tags: string[] }} body */
export function createArticle(body) {
  return apiFetch('/admin/knowledge', { method: 'POST', body })
}

/** @param {{ title?: string, body_markdown?: string, category?: string, tags?: string[], status?: string }} body */
export function updateArticle(id, body) {
  return apiFetch(`/admin/knowledge/${encodeURIComponent(id)}`, { method: 'PATCH', body })
}
