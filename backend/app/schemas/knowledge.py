import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.db.models.enums import ArticleStatus, Category
from app.schemas.common import NoNul, ORMModel, StrictInput

MAX_QUERY_LENGTH = 200
SNIPPET_MAX_LENGTH = 300

Slug = Annotated[
    str,
    StringConstraints(min_length=3, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
]
ArticleTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200), NoNul
]
# Stored and returned verbatim, so it is deliberately not trimmed or altered.
ArticleBody = Annotated[str, StringConstraints(min_length=1, max_length=50000), NoNul]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50), NoNul]
Tags = Annotated[list[Tag], Field(max_length=20)]


class ArticleCreate(StrictInput):
    slug: Slug
    title: ArticleTitle
    body_markdown: ArticleBody
    category: Category
    tags: Tags = []

    @field_validator("body_markdown")
    @classmethod
    def body_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class ArticleUpdate(StrictInput):
    """Omitted fields are unchanged. A content change increments the version."""

    title: ArticleTitle | None = None
    body_markdown: ArticleBody | None = None
    category: Category | None = None
    tags: Tags | None = None
    status: ArticleStatus | None = None

    @field_validator("body_markdown")
    @classmethod
    def body_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def validate_change(self) -> "ArticleUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to change")
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ArticleSummary(ORMModel):
    id: uuid.UUID
    slug: str
    title: str
    category: Category
    tags: list[str]
    version: int
    updated_at: datetime
    snippet: str


class AdminArticleSummary(ArticleSummary):
    status: ArticleStatus
    updated_by: uuid.UUID | None


class ArticleDetail(ORMModel):
    id: uuid.UUID
    slug: str
    title: str
    category: Category
    tags: list[str]
    version: int
    updated_at: datetime
    body_markdown: str
    status: ArticleStatus


class AdminArticleDetail(ArticleDetail):
    created_at: datetime
    updated_by: uuid.UUID | None
