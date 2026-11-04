"""Safeguards for the public demo: the lazy daily reset and the volume caps (ADR-051).

Everything here applies only with DEMO_MODE=true.
"""

import logging
import time
from collections.abc import Callable

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.db.models import DemoState, KnowledgeArticle, ServiceRequest, User
from app.db.session import SessionLocal
from app.scripts import seed_data
from app.scripts.seed_demo import seed_demo, stable_id

logger = logging.getLogger(__name__)

BUSY_MESSAGE = "The public demo is busy; data resets daily. Please try again later."
# How soon to look again when a reset is not due, or could not run.
RECHECK_SECONDS = 60.0

_SEED_REQUEST_IDS = [stable_id("request", spec["key"]) for spec in seed_data.REQUESTS]
_SEED_ARTICLE_SLUGS = [spec["slug"] for spec in [*seed_data.ARTICLES, seed_data.DRAFT_ARTICLE]]


def reset_if_due(settings: Settings, session_factory: Callable[[], Session] = SessionLocal) -> bool:
    """Reset and reseed when the interval has passed. Returns whether this call did the reset.

    The database function makes the final decision under an advisory lock, and the reseed shares its
    transaction, so readers see either the old data or the new, and only one caller runs it.
    """
    if not settings.demo_mode or not settings.demo_password:
        return False
    with session_factory() as db:
        state = db.execute(select(DemoState.reset_enabled, DemoState.last_reset_at)).one_or_none()
        if state is None or not state.reset_enabled:
            return False
        started = db.scalar(
            text("SELECT demo_reset_begin(:hours)"),
            {"hours": settings.demo_reset_interval_hours},
        )
        if not started:
            db.rollback()
            return False
        seed_demo(db, settings.demo_password)  # Commits, which also releases the advisory lock.
    logger.info("demo_reset_complete")
    return True


class DemoResetSchedule:
    """Limits the database check to once a minute per process, and to one caller at a time."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._next_check = 0.0

    def claim(self) -> bool:
        """True when this caller should check now. Single-threaded, on the server's event loop."""
        now = self._clock()
        if now < self._next_check:
            return False
        self._next_check = now + RECHECK_SECONDS
        return True


def check_request_caps(db: Session, user: User) -> None:
    settings = get_settings()
    if not settings.demo_mode:
        return
    created_today = db.scalar(
        select(func.count())
        .select_from(ServiceRequest)
        .where(
            ServiceRequest.requester_id == user.id,
            ServiceRequest.id.not_in(_SEED_REQUEST_IDS),
            ServiceRequest.created_at >= func.now() - text("interval '1 day'"),
        )
    )
    if created_today >= settings.demo_max_requests_per_account_per_day:
        raise AppError(
            429,
            "DEMO_LIMIT_REACHED",
            "This demo account has reached its daily request limit. Data resets daily.",
        )
    total = db.scalar(
        select(func.count())
        .select_from(ServiceRequest)
        .where(ServiceRequest.id.not_in(_SEED_REQUEST_IDS))
    )
    if total >= settings.demo_max_requests_total:
        raise AppError(409, "DEMO_CAPACITY_REACHED", BUSY_MESSAGE)


def check_article_cap(db: Session) -> None:
    settings = get_settings()
    if not settings.demo_mode:
        return
    total = db.scalar(
        select(func.count())
        .select_from(KnowledgeArticle)
        .where(KnowledgeArticle.slug.not_in(_SEED_ARTICLE_SLUGS))
    )
    if total >= settings.demo_max_articles:
        raise AppError(409, "DEMO_CAPACITY_REACHED", BUSY_MESSAGE)
