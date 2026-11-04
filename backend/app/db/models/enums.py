"""Enumerations: the single source of truth for values stored as VARCHAR + CHECK (ADR-006)."""

from enum import StrEnum


class Role(StrEnum):
    USER = "USER"
    AGENT = "AGENT"
    ADMIN = "ADMIN"


class Category(StrEnum):
    ACCOUNT_ACCESS = "ACCOUNT_ACCESS"
    SOFTWARE = "SOFTWARE"
    HARDWARE = "HARDWARE"
    NETWORK = "NETWORK"
    OTHER = "OTHER"


class Priority(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class RequestStatus(StrEnum):
    NEW = "NEW"
    ANALYZING = "ANALYZING"
    TRIAGED = "TRIAGED"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class ArticleStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class AiRunStatus(StrEnum):
    STARTED = "STARTED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class AiMode(StrEnum):
    MOCK = "MOCK"
    GEMINI = "GEMINI"


class ReviewState(StrEnum):
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class EventType(StrEnum):
    REQUEST_CREATED = "REQUEST_CREATED"
    ASSIGNED = "ASSIGNED"
    UNASSIGNED = "UNASSIGNED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    CATEGORY_CHANGED = "CATEGORY_CHANGED"
    STATUS_CHANGED = "STATUS_CHANGED"
    COMMENT_ADDED = "COMMENT_ADDED"
