import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.models import KnowledgeArticle, User
from app.db.models.enums import ArticleStatus, Category, Role
from app.db.session import get_db
from app.schemas.common import NoNul, Page
from app.schemas.knowledge import (
    MAX_QUERY_LENGTH,
    SNIPPET_MAX_LENGTH,
    AdminArticleDetail,
    AdminArticleSummary,
    ArticleCreate,
    ArticleDetail,
    ArticleSummary,
    ArticleUpdate,
)
from app.services import knowledge as knowledge_service
from app.services.text import make_snippet

router = APIRouter(prefix="/knowledge", tags=["knowledge"])
admin_router = APIRouter(prefix="/admin/knowledge", tags=["admin"])


def _summary(article: KnowledgeArticle, snippet: str | None = None) -> ArticleSummary:
    return ArticleSummary(
        id=article.id,
        slug=article.slug,
        title=article.title,
        category=article.category,
        tags=article.tags,
        version=article.version,
        updated_at=article.updated_at,
        snippet=make_snippet(article.body_markdown, SNIPPET_MAX_LENGTH)
        if snippet is None
        else snippet,
    )


def _admin_summary(article: KnowledgeArticle) -> AdminArticleSummary:
    return AdminArticleSummary(
        **_summary(article).model_dump(), status=article.status, updated_by=article.updated_by
    )


@router.get("")
def search_knowledge(
    q: Annotated[str | None, Query(max_length=MAX_QUERY_LENGTH), NoNul] = None,
    category: Category | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Page[ArticleSummary]:
    """Without `q`, browse published articles. With `q`, rank them; blank `q` matches nothing."""
    if q is None:
        articles, total = knowledge_service.list_published(
            db, category=category, limit=limit, offset=offset
        )
        items = [_summary(article) for article in articles]
    else:
        results, total = knowledge_service.search_published(
            db, q, category=category, limit=limit, offset=offset
        )
        articles = [result.article for result in results]
        snippets = knowledge_service.query_snippets(
            db, [article.body_markdown for article in articles], q, SNIPPET_MAX_LENGTH
        )
        items = [
            _summary(article, snippet) for article, snippet in zip(articles, snippets, strict=True)
        ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{article_id}")
def get_article(
    article_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArticleDetail:
    article = knowledge_service.get_article_for_viewer(db, user, article_id)
    return ArticleDetail.model_validate(article)


@admin_router.get("")
def admin_list_knowledge(
    status: ArticleStatus | None = None,
    category: Category | None = None,
    q: Annotated[str | None, Query(max_length=MAX_QUERY_LENGTH), NoNul] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
) -> Page[AdminArticleSummary]:
    articles, total = knowledge_service.list_all(
        db, status=status, category=category, q=q, limit=limit, offset=offset
    )
    return Page(
        items=[_admin_summary(article) for article in articles],
        total=total,
        limit=limit,
        offset=offset,
    )


@admin_router.post("", status_code=201)
def admin_create_article(
    payload: ArticleCreate,
    admin: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
) -> AdminArticleDetail:
    return AdminArticleDetail.model_validate(knowledge_service.create_article(db, admin, payload))


@admin_router.patch("/{article_id}")
def admin_update_article(
    article_id: uuid.UUID,
    payload: ArticleUpdate,
    admin: User = Depends(require_roles(Role.ADMIN)),
    db: Session = Depends(get_db),
) -> AdminArticleDetail:
    article = knowledge_service.update_article(db, admin, article_id, payload)
    return AdminArticleDetail.model_validate(article)
