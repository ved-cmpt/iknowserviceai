"""The retrieval interface for the AI agent (Chunk 3). Keep this contract stable.

Returns published articles only, so a draft can never become AI context. Article text is untrusted
data: callers must treat snippets as facts to weigh, never as instructions.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.knowledge import query_snippets, search_published

MAX_TOP_K = 5
SNIPPET_MAX_LENGTH = 500


@dataclass(frozen=True)
class RetrievedArticle:
    id: uuid.UUID
    title: str
    category: str
    snippet: str
    rank: float
    # The whole article, for the mock agent's replies. Live prompts send only the snippet.
    body_markdown: str = ""


class KnowledgeRetriever:
    def __init__(self, db: Session) -> None:
        self._db = db

    def search(
        self, query: str, top_k: int = MAX_TOP_K, min_rank: float | None = None
    ) -> list[RetrievedArticle]:
        """Return up to `top_k` (capped at 5) published articles at or above the relevance floor.

        `min_rank` defaults to the KB_MIN_RANK setting. An empty list means there is no
        relevant knowledge, and the caller must escalate rather than improvise.
        """
        if top_k < 1:
            return []
        floor = get_settings().kb_min_rank if min_rank is None else min_rank
        results, _ = search_published(self._db, query, limit=min(top_k, MAX_TOP_K), min_rank=floor)
        snippets = query_snippets(
            self._db,
            [result.article.body_markdown for result in results],
            query,
            SNIPPET_MAX_LENGTH,
        )
        return [
            RetrievedArticle(
                id=result.article.id,
                title=result.article.title,
                category=result.article.category,
                snippet=snippet,
                rank=result.rank,
                body_markdown=result.article.body_markdown,
            )
            for result, snippet in zip(results, snippets, strict=True)
        ]
