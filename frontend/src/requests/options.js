export const SORT_OPTIONS = [
  ['created_at:desc', 'Newest first'],
  ['created_at:asc', 'Oldest first'],
  ['updated_at:desc', 'Recently updated'],
  ['priority:desc', 'Highest priority'],
  ['priority:asc', 'Lowest priority'],
]

export const DEFAULT_SORT = 'created_at:desc'
export const PAGE_SIZE = 20

export function sortParams(value) {
  const [sort, direction] = (value || DEFAULT_SORT).split(':')
  return { sort, direction }
}
