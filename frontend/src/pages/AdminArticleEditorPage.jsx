import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { friendlyMessage } from '../api/errors'
import { articlePath, createArticle, updateArticle } from '../api/knowledge'
import { useApiData } from '../api/useApiData'
import Badge from '../components/Badge'
import Banner from '../components/Banner'
import Button from '../components/Button'
import Card from '../components/Card'
import ErrorState from '../components/ErrorState'
import FormField from '../components/FormField'
import LoadingState from '../components/LoadingState'
import SafeMarkdown from '../components/SafeMarkdown'
import {
  ARTICLE_TITLE_MAX,
  articleStatusLabel,
  BODY_MAX,
  parseTags,
  SLUG_MAX,
  slugify,
  validateArticle,
} from '../knowledge/articleForm'
import ArticleStatusActions from '../knowledge/ArticleStatusActions'
import { CATEGORIES } from '../knowledge/categories'
import NotFoundPage from './NotFoundPage'

const CATEGORY_OPTIONS = CATEGORIES.filter(([value]) => value !== '')

function sameTags(left, right) {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function ArticleForm({ article, notice, onSave, onChanged }) {
  const editing = Boolean(article)
  const [title, setTitle] = useState(article?.title ?? '')
  const [slugDraft, setSlugDraft] = useState(null) // null until edited: follows the title.
  const [category, setCategory] = useState(article?.category ?? 'OTHER')
  const [tags, setTags] = useState(article?.tags.join(', ') ?? '')
  const [body, setBody] = useState(article?.body_markdown ?? '')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [message, setMessage] = useState(notice)
  const [saving, setSaving] = useState(false)

  const slug = editing ? article.slug : (slugDraft ?? slugify(title))

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return
    const found = validateArticle({ title, slug, body, tags })
    setErrors(found)
    setServerError(null)
    setMessage(null)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      await onSave({ title: title.trim(), slug, category, tags: parseTags(tags), body }, setMessage)
    } catch (cause) {
      if (cause.code === 'SLUG_CONFLICT') setErrors({ slug: friendlyMessage(cause) })
      else setServerError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>{editing ? 'Edit article' : 'New article'}</h1>
        {editing && (
          <span>
            <Badge tone={article.status === 'PUBLISHED' ? 'success' : 'warning'}>
              {articleStatusLabel(article.status)}
            </Badge>{' '}
            <span className="meta">Version {article.version}</span>
          </span>
        )}
      </div>
      {message && (
        <Banner tone="success" role="status">
          {message}
        </Banner>
      )}
      {serverError && <ErrorState error={serverError} />}
      {editing && (
        <Card as="div">
          <ArticleStatusActions article={article} onChanged={onChanged} />
        </Card>
      )}
      <div className="editor-grid">
        <Card as="div">
          <form onSubmit={handleSubmit} noValidate>
            <FormField
              label="Title"
              required
              error={errors.title}
              count={title.length}
              max={ARTICLE_TITLE_MAX}
            >
              {(field) => (
                <input {...field} value={title} onChange={(event) => setTitle(event.target.value)} />
              )}
            </FormField>
            <FormField
              label="Slug"
              required
              hint={
                editing
                  ? 'A slug never changes, so links keep working.'
                  : 'Filled in from the title. You can edit it.'
              }
              error={errors.slug}
              count={slug.length}
              max={SLUG_MAX}
            >
              {(field) => (
                <input
                  {...field}
                  value={slug}
                  readOnly={editing}
                  onChange={(event) => setSlugDraft(event.target.value)}
                />
              )}
            </FormField>
            <FormField label="Category" required>
              {(field) => (
                <select
                  {...field}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Tags" hint="Separate tags with commas." error={errors.tags}>
              {(field) => (
                <input {...field} value={tags} onChange={(event) => setTags(event.target.value)} />
              )}
            </FormField>
            <FormField
              label="Body (markdown)"
              required
              error={errors.body}
              count={body.length}
              max={BODY_MAX}
            >
              {(field) => (
                <textarea
                  {...field}
                  rows={14}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              )}
            </FormField>
            <Button type="submit" busy={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}
            </Button>
          </form>
        </Card>
        <Card title="Preview" className="article-preview">
          <p className="meta">Rendered the same way as the published page. Raw HTML stays inert.</p>
          <div className="preview-pane" data-testid="article-preview">
            {body.trim() ? (
              <SafeMarkdown>{body}</SafeMarkdown>
            ) : (
              <p className="muted">Nothing to preview yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}

function NewArticle() {
  const navigate = useNavigate()

  async function save({ title, slug, category, tags, body }) {
    const created = await createArticle({ title, slug, category, tags, body_markdown: body })
    navigate(`/admin/knowledge/${created.id}/edit`, {
      replace: true,
      state: { notice: 'Draft created. Publish it when it is ready.' },
    })
  }

  return <ArticleForm onSave={save} />
}

function EditArticle({ id }) {
  const location = useLocation()
  const { loading, data, error, reload, setData } = useApiData(articlePath(id))

  if (error?.status === 404) return <NotFoundPage message="This article does not exist." />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (loading && !data) return <LoadingState label="Loading article…" />

  async function save({ title, category, tags, body }, setMessage) {
    const changes = {}
    if (title !== data.title) changes.title = title
    if (category !== data.category) changes.category = category
    if (!sameTags(tags, data.tags)) changes.tags = tags
    if (body !== data.body_markdown) changes.body_markdown = body

    if (Object.keys(changes).length === 0) {
      setMessage('No changes to save.')
      return
    }
    const updated = await updateArticle(id, changes)
    setData(updated)
    setMessage(`Saved. This is now version ${updated.version}.`) // Shown in a live status banner.
  }

  return (
    <ArticleForm
      article={data}
      notice={location.state?.notice}
      onSave={save}
      onChanged={setData}
    />
  )
}

export default function AdminArticleEditorPage() {
  const { id } = useParams()
  return (
    <>
      <p>
        <Link className="back-link" to="/admin/knowledge">
          ← Back to knowledge admin
        </Link>
      </p>
      {id ? <EditArticle key={id} id={id} /> : <NewArticle />}
    </>
  )
}
