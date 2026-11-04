"""Structured logging with a per-request correlation ID.

Log only request metadata. Never log Authorization headers, passwords or request bodies.
SecretMaskingFilter is a second line of defense for mistakes, not permission to log such values.
"""

import json
import logging
import re
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_EXTRA_FIELDS = (
    "method",
    "path",
    "status",
    "duration_ms",
    "ai_run_id",
    "error_code",
    "http_status",
)

_MASK = "[MASKED]"
_SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]+=*", re.IGNORECASE), f"Bearer {_MASK}"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*"), _MASK),
    (re.compile(r"\bAQ\.[A-Za-z0-9_-]{16,}"), _MASK),
    (re.compile(r"\bAIza[A-Za-z0-9_-]{20,}"), _MASK),
    (re.compile(r"\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{10,}"), _MASK),
    (re.compile(r"\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}"), _MASK),
    (
        re.compile(
            r"""(\b(?:password|passwd|pwd|secret|jwt_secret|api[_-]?key|x-goog-api-key|token"""
            r"""|access_token|authorization|key)["']?\s*[:=]\s*["']?)[^\s"',&}]+""",
            re.IGNORECASE,
        ),
        rf"\1{_MASK}",
    ),
)
# These log full URLs at INFO, which could include search text or tokens.
_QUIET_LOGGERS = ("httpx", "httpx2", "httpcore", "google_genai", "google.genai")


def mask_secrets(text: str) -> str:
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class SecretMaskingFilter(logging.Filter):
    """Mask secret-like values in the final message of every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = mask_secrets(record.getMessage())
        record.args = None
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        for field in _EXTRA_FIELDS:
            if hasattr(record, field):
                entry[field] = getattr(record, field)
        if record.exc_info:
            # Exception text can quote request data, so it is masked as well.
            entry["exception"] = mask_secrets(self.formatException(record.exc_info))
        return json.dumps(entry)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SecretMaskingFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
