export function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'Not recorded'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}
