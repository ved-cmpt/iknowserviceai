"""Mask sensitive values before text reaches an AI provider.

Only redacted text is sent to a provider. It is stored in `ai_runs.redacted_input`, is never logged
and is never returned to requesters. Order matters: specific patterns run before general ones, so
a card number is not reported as a phone number. Masking too much is the safer failure.
"""

import re

MASKS = ("SECRET", "JWT", "URL", "EMAIL", "API_KEY", "CARD", "TOKEN", "ID", "PHONE")

# "my password is expired" describes a problem, so the next word is not a secret.
_DESCRIBES_A_PROBLEM = (
    r"(?!(?:not|no|never|wrong|incorrect|correct|invalid|expired|locked|being|still|too|very|the|a"
    r"|an|my|failing|working|broken|required|needed|rejected|reset|changed|missing)\b)"
)
_QUOTED_OR_WORD = r"(\"[^\"]*\"|'[^']*'|\S+)"

_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # Secrets keep their label, so policy scanning can still see what kind of thing was written.
    (
        re.compile(
            r"\b(pass(?:word|wd|code|phrase)|pwd|secret|api[ _-]?key|access[ _-]?token"
            r"|auth[ _-]?token|token|recovery[ _-]?code|otp|pin)\b(\s*[:=]\s*)" + _QUOTED_OR_WORD,
            re.IGNORECASE,
        ),
        r"\1\2[SECRET]",
    ),
    (
        re.compile(
            r"\b(pass(?:word|wd|code|phrase)|pwd)\b(\s+is\s+)"
            + _DESCRIBES_A_PROBLEM
            + _QUOTED_OR_WORD,
            re.IGNORECASE,
        ),
        r"\1\2[SECRET]",
    ),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*"), "[JWT]"),
    # A URL with a query string or embedded credentials can carry a token.
    (re.compile(r"\bhttps?://[^\s/@]+:[^\s/@]+@\S+", re.IGNORECASE), "[URL]"),
    (re.compile(r"\bhttps?://[^\s?]+\?\S*", re.IGNORECASE), "[URL]"),
    (
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b"),
        "[EMAIL]",
    ),
    (
        re.compile(
            r"\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{10,}"
            r"|\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}"
            r"|\bxox[abprs]-[A-Za-z0-9-]{10,}"
            r"|\bAKIA[A-Z0-9]{12,}"
            r"|\bAIza[A-Za-z0-9_-]{20,}"
            r"|\bAQ\.[A-Za-z0-9_-]{16,}"
        ),
        "[API_KEY]",
    ),
    (re.compile(r"(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])"), "[CARD]"),
    (
        re.compile(
            r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE
        ),
        "[ID]",
    ),
    (re.compile(r"\b[0-9a-fA-F]{16,}\b"), "[TOKEN]"),
    # Long base64-like runs must mix letters and digits, so long ordinary words survive.
    (
        re.compile(
            r"(?<![\w+/=-])(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])"
            r"[A-Za-z0-9+/_-]{32,}={0,2}"
        ),
        "[TOKEN]",
    ),
    (
        re.compile(
            r"(?<![\w.-])(?:\+?\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{3,4}[ .-]\d{3,4}"
            r"(?![\w-])"
            r"|(?<![\w.-])\+\d{8,15}(?![\w-])"
            r"|(?<![\w.-])\d{3}[ .-]\d{4}(?![\w.-])"
        ),
        "[PHONE]",
    ),
    (re.compile(r"\b\d{7,}\b"), "[ID]"),
)

_MASK_TOKENS = re.compile(r"\[(?:" + "|".join(MASKS) + r")\]")


def redact(text: str) -> str:
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    return text


def without_masks(text: str) -> str:
    """Remove mask tokens, so a search for `[EMAIL]` does not match articles about email."""
    return _MASK_TOKENS.sub(" ", text)
