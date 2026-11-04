"""Knowledge base: published search, article reads and admin management."""

import uuid
from dataclasses import dataclass

from sqlalchemy import ColumnElement, Select, Text, cast, func, literal_column, or_, select, text
from sqlalchemy.dialects.postgresql import TSQUERY
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import conflict, not_found
from app.db.models import KnowledgeArticle, User
from app.db.models.enums import ArticleStatus, Category, Role
from app.schemas.knowledge import ArticleCreate, ArticleUpdate
from app.services import demo
from app.services.audit import record_audit
from app.services.text import make_snippet, markdown_to_plain_text

ENTITY_TYPE = "knowledge_article"
CONTENT_FIELDS = ("title", "body_markdown", "category", "tags")
_FTS_CONFIG = literal_column("'english'::regconfig")  # Matches the generated search_vector column.


@dataclass(frozen=True)
class RankedArticle:
    article: KnowledgeArticle
    rank: float


def _published() -> ColumnElement[bool]:
    return KnowledgeArticle.status == ArticleStatus.PUBLISHED.value


def _search_queries(query: str) -> tuple[ColumnElement, ColumnElement]:
    """Build (all terms, any term) tsqueries from user text.

    websearch_to_tsquery never raises on user input. The any-term form swaps its AND operators
    for OR, so natural-language requests still find articles (ADR-015).
    """
    every_term = func.websearch_to_tsquery(_FTS_CONFIG, query)
    any_term = cast(func.replace(cast(every_term, Text), " & ", " | "), TSQUERY)
    return every_term, any_term


def search_published(
    db: Session,
    query: str,
    *,
    category: Category | None = None,
    limit: int,
    offset: int = 0,
    min_rank: float = 0.0,
) -> tuple[list[RankedArticle], int]:
    """Rank published articles against query text. A blank or no-match query returns nothing.

    Ordering is deterministic: all-term matches first, then rank, newest update, and ID.
    """
    if not query.strip():
        return [], 0

    every_term, any_term = _search_queries(query)
    rank = func.ts_rank_cd(KnowledgeArticle.search_vector, any_term)
    matches_all = KnowledgeArticle.search_vector.bool_op("@@")(every_term)
    matches_any = KnowledgeArticle.search_vector.bool_op("@@")(any_term)

    conditions = [_published(), matches_any, rank >= min_rank]
    if category:
        conditions.append(KnowledgeArticle.category == category.value)

    total = db.scalar(select(func.count()).select_from(KnowledgeArticle).where(*conditions)) or 0
    rows = db.execute(
        select(KnowledgeArticle, rank.label("rank"))
        .where(*conditions)
        .order_by(
            matches_all.desc(),
            rank.desc(),
            KnowledgeArticle.updated_at.desc(),
            KnowledgeArticle.id,
        )
        .limit(limit)
        .offset(offset)
    ).all()
    return [RankedArticle(article=row[0], rank=float(row[1])) for row in rows], total


def query_snippets(db: Session, bodies: list[str], query: str, max_length: int) -> list[str]:
    """Return one snippet per article body, showing the text around the matched terms (ADR-024).

    Markup is removed before PostgreSQL sees the text, so a fragment can never start inside a tag
    or a script block. A body with no matching term falls back to its leading text.
    """
    if not bodies:
        return []
    plain_bodies = [markdown_to_plain_text(body) for body in bodies]
    # Roughly 16 characters per word across two fragments keeps most results under the cap.
    max_words = max(20, max_length // 16)
    options = (
        f'StartSel="", StopSel="", MaxWords={max_words}, MinWords={max_words // 2}, '
        'MaxFragments=2, FragmentDelimiter=" … "'
    )
    rows = db.execute(
        text(
            "SELECT ts_headline('english'::regconfig, body, "
            "replace(websearch_to_tsquery('english'::regconfig, :query)::text, ' & ', ' | ')"
            "::tsquery, :options) "
            "FROM unnest(CAST(:bodies AS text[])) WITH ORDINALITY AS item(body, position) "
            "ORDER BY position"
        ),
        {"query": query, "options": options, "bodies": plain_bodies},
    ).scalars()
    return [make_snippet(headline, max_length) for headline in rows]


def _paged(db: Session, query: Select, limit: int, offset: int) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(KnowledgeArticle.updated_at.desc(), KnowledgeArticle.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return list(rows), total


def list_published(
    db: Session, *, category: Category | None, limit: int, offset: int
) -> tuple[list[KnowledgeArticle], int]:
    query = select(KnowledgeArticle).where(_published())
    if category:
        query = query.where(KnowledgeArticle.category == category.value)
    return _paged(db, query, limit, offset)


def list_all(
    db: Session,
    *,
    status: ArticleStatus | None,
    category: Category | None,
    q: str | None = None,
    limit: int,
    offset: int,
) -> tuple[list[KnowledgeArticle], int]:
    query = select(KnowledgeArticle)
    if status:
        query = query.where(KnowledgeArticle.status == status.value)
    if category:
        query = query.where(KnowledgeArticle.category == category.value)
    if q and q.strip():
        # A plain substring match on title and slug, for finding an article you know exists.
        # Unlike public search, this has no ranking and covers every status.
        term = q.strip()
        query = query.where(
            or_(
                KnowledgeArticle.title.icontains(term, autoescape=True),
                KnowledgeArticle.slug.icontains(term, autoescape=True),
            )
        )
    return _paged(db, query, limit, offset)


def get_article_for_viewer(db: Session, user: User, article_id: uuid.UUID) -> KnowledgeArticle:
    """Published articles are for everyone. Other statuses exist only for ADMIN; others get 404."""
    article = db.get(KnowledgeArticle, article_id)
    if article is None:
        raise not_found("Article not found")
    if article.status != ArticleStatus.PUBLISHED and user.role != Role.ADMIN:
        raise not_found("Article not found")
    return article


def _slug_conflict() -> Exception:
    return conflict("SLUG_CONFLICT", "An article with this slug already exists")


def create_article(db: Session, admin: User, payload: ArticleCreate) -> KnowledgeArticle:
    demo.check_article_cap(db)
    if db.scalar(select(KnowledgeArticle.id).where(KnowledgeArticle.slug == payload.slug)):
        raise _slug_conflict()

    article = KnowledgeArticle(
        slug=payload.slug,
        title=payload.title,
        body_markdown=payload.body_markdown,
        category=payload.category.value,
        tags=payload.tags,
        status=ArticleStatus.DRAFT.value,
        updated_by=admin.id,
    )
    db.add(article)
    try:
        db.flush()
    except IntegrityError:  # Lost a race with another create of the same slug.
        db.rollback()
        raise _slug_conflict() from None

    record_audit(
        db,
        actor_id=admin.id,
        entity_type=ENTITY_TYPE,
        entity_id=article.id,
        action="knowledge.created",
        metadata={"slug": article.slug, "version": article.version},
    )
    db.commit()
    return article


def _status_action(previous: str, new: str) -> str:
    if new == ArticleStatus.PUBLISHED:
        return "knowledge.published"
    if previous == ArticleStatus.PUBLISHED:
        return "knowledge.unpublished"
    return "knowledge.status_changed"


def update_article(
    db: Session, admin: User, article_id: uuid.UUID, payload: ArticleUpdate
) -> KnowledgeArticle:
    """Edit content and/or status. A content change increments `version`; the ID never changes."""
    article = db.scalar(
        select(KnowledgeArticle)
        .where(KnowledgeArticle.id == article_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if article is None:
        raise not_found("Article not found")

    changed_fields = []
    for field in CONTENT_FIELDS:
        if field not in payload.model_fields_set:
            continue
        value = getattr(payload, field)
        stored_value = value.value if isinstance(value, Category) else value
        if getattr(article, field) != stored_value:
            setattr(article, field, stored_value)
            changed_fields.append(field)

    if changed_fields:
        article.version += 1
        record_audit(
            db,
            actor_id=admin.id,
            entity_type=ENTITY_TYPE,
            entity_id=article.id,
            action="knowledge.updated",
            metadata={"changed_fields": changed_fields, "version": article.version},
        )

    previous_status = article.status
    status_changed = payload.status is not None and payload.status.value != previous_status
    if status_changed:
        article.status = payload.status.value
        record_audit(
            db,
            actor_id=admin.id,
            entity_type=ENTITY_TYPE,
            entity_id=article.id,
            action=_status_action(previous_status, payload.status),
            metadata={
                "from": previous_status,
                "to": payload.status.value,
                "version": article.version,
            },
        )

    if changed_fields or status_changed:
        article.updated_by = admin.id
    db.commit()
    return article
