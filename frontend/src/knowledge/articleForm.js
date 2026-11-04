// Mirrors the API's article bounds. The API still checks.
export const ARTICLE_TITLE_MIN = 3
export const ARTICLE_TITLE_MAX = 200
export const SLUG_MIN = 3
export const SLUG_MAX = 120
export const BODY_MAX = 50000
export const TAGS_MAX = 20
export const TAG_MAX = 50

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(title) {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Accents, once separated from their letters.
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '')
}

export function parseTags(text) {
  const tags = text
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  return [...new Set(tags)]
}

export function validateArticle({ title, slug, body, tags }) {
  const errors = {}
  const titleLength = title.trim().length
  if (titleLength < ARTICLE_TITLE_MIN || titleLength > ARTICLE_TITLE_MAX) {
    errors.title = `Enter a title of ${ARTICLE_TITLE_MIN} to ${ARTICLE_TITLE_MAX} characters.`
  }
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    errors.slug = `Use ${SLUG_MIN} to ${SLUG_MAX} lowercase letters, numbers and single hyphens.`
  }
  if (!body.trim()) errors.body = 'Write the article body.'
  else if (body.length > BODY_MAX) errors.body = `Keep the body to ${BODY_MAX} characters or fewer.`
  const parsed = parseTags(tags)
  if (parsed.length > TAGS_MAX) errors.tags = `Use ${TAGS_MAX} tags or fewer.`
  else if (parsed.some((tag) => tag.length > TAG_MAX)) {
    errors.tags = `Keep each tag to ${TAG_MAX} characters or fewer.`
  }
  return errors
}

// Which status moves to offer for each article status.
export const STATUS_ACTIONS = {
  DRAFT: [
    { status: 'PUBLISHED', label: 'Publish' },
    { status: 'ARCHIVED', label: 'Archive' },
  ],
  PUBLISHED: [
    { status: 'DRAFT', label: 'Unpublish' },
    { status: 'ARCHIVED', label: 'Archive' },
  ],
  ARCHIVED: [{ status: 'DRAFT', label: 'Restore as draft' }],
}

export const ARTICLE_STATUS_OPTIONS = [
  ['DRAFT', 'Draft'],
  ['PUBLISHED', 'Published'],
  ['ARCHIVED', 'Archived'],
]

const ARTICLE_STATUS_LABELS = Object.fromEntries(ARTICLE_STATUS_OPTIONS)

export function articleStatusLabel(status) {
  return ARTICLE_STATUS_LABELS[status] ?? status
}
