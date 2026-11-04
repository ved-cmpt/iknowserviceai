"""The deterministic safety gate. It does not depend on the model and the model cannot lower it.

Request text is scanned after redaction, so mask tokens such as [SECRET] are visible here. The
patterns are deliberately broad, because a false positive costs a staff review and a false negative
could show unsafe advice. They are a safety net, not a complete defense (see docs/SECURITY.md).
"""

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from app.db.models.enums import Priority, RiskFlag
from app.services.ai.base import TriageResult


def _patterns(*sources: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(source) for source in sources)


_CONFIDENTIAL_NOUN = (
    r"(?:credentials?|passwords?|passcodes?|pass ?phrases?|recovery codes?|backup codes?|api keys?"
    r"|secret keys?|private keys?|access tokens?|tokens?|mfa codes?|2fa codes?|otps?"
    r"|one[- ]time (?:code|password)s?|verification codes?|security codes?|pins?)"
)

# All scanning happens on normalized lowercase text (see normalize_for_scan).
HARD_SIGNALS: dict[RiskFlag, tuple[re.Pattern[str], ...]] = {
    RiskFlag.ACCOUNT_COMPROMISE: _patterns(
        r"\b(?:someone|somebody|stranger|attacker|hacker|intruder)\b.{0,50}\b(?:access\w*|logged|"
        r"log(?:ging)? in|signed|using|got into|broke into|into)\b.{0,40}\b(?:account|email|mailbox"
        r"|login|profile)\b",
        r"\b(?:hacked|hijacked|compromised|taken over)\b",
        r"\bunauthori[sz]ed\b.{0,20}\b(?:access|log ?in|sign-?in|activity|charges?|use)\b",
        r"\bsuspicious\b.{0,20}\b(?:log ?in|sign-?in|activity)\b",
    ),
    RiskFlag.CREDENTIAL_REQUEST: _patterns(
        r"\b(?:need|give|send|share|want|provide|tell|reveal|show|print|leak|what is|what's)\b"
        r".{0,40}\b" + _CONFIDENTIAL_NOUN + r"\b",
        r"\[(?:secret|api_key|jwt)\]",  # The requester pasted a secret.
    ),
    RiskFlag.PHISHING: _patterns(
        r"\bphish\w*\b",
        r"\bspoof\w*\b",
        r"\bscam\w*\b",
        r"\bsuspicious\b.{0,20}\b(?:emails?|messages?|links?|attachments?|texts?|calls?)\b",
        r"\bfake\b.{0,20}\b(?:emails?|log ?in|sign-?in|site|website|page)\b",
    ),
    RiskFlag.PRIVACY_SENSITIVE: _patterns(
        r"\b(?:student|employee|patient|medical|health|personal|salary|payroll|grades?|hr|staff)\b"
        r".{0,20}\b(?:records?|data|files?|information|details)\b",
        r"\b(?:social security|ssn|gdpr|data (?:breach|leak)|confidential)\b",
    ),
    RiskFlag.PAYMENT: _patterns(
        r"\b(?:payments?|invoices?|refunds?|billing|wire transfer|purchase order)\b",
        r"\b(?:credit|debit) cards?\b",
        r"\bbank (?:account|details|transfer)\b",
        r"\[card\]",
    ),
    RiskFlag.PRIVILEGED_ACCESS: _patterns(
        r"\b(?:admin|administrator|root|superuser)\b.{0,15}\b(?:access|rights|privileges?"
        r"|permissions?|role|credentials?|account|password)\b",
        r"\bsudo\b",
        r"\b(?:grant|give|make)\b.{0,25}\b(?:admin|administrator|root|superuser)\b",
        r"\b(?:elevat\w+|escalat\w+)\b.{0,15}\b(?:privileges?|permissions?|access|rights)\b",
    ),
    RiskFlag.ACCOUNT_RECOVERY: _patterns(
        r"\b(?:forgot|forgotten|lost|reset|recover|recovering|resetting)\b.{0,20}\b(?:password"
        r"|passcode|account|mfa|2fa|authenticator)\b",
        r"\block(?:ed)? out\b",
        r"\baccount recovery\b",
        r"\b(?:lost|replaced|new|stolen)\b.{0,20}\b(?:mfa|2fa|authenticator|phone)\b.{0,40}"
        r"\b(?:sign|log|mfa|2fa|code|authenticat)",
    ),
    RiskFlag.DEVICE_WIPE: _patterns(
        r"\bwip(?:e|ed|ing)\b.{0,30}\b(?:laptop|device|phone|computer|drive|disk|data|machine)\b",
        r"\b(?:laptop|device|phone|computer|drive|disk|machine)\b.{0,30}\bwip(?:e|ed|ing)\b",
        r"\b(?:factory reset|re-?image|remote wipe)\b",
        r"\b(?:erase|format)\b.{0,15}\b(?:laptop|device|phone|computer|drive|disk)\b",
    ),
    RiskFlag.DESTRUCTIVE_ACTION: _patterns(
        r"\b(?:delete|drop|remove|purge|destroy|erase)\b.{0,30}\b(?:all|every|entire|database|table"
        r"|tables|accounts?|users?|records|backups?|logs?|audit)\b",
        r"\brm -rf\b",
        r"\b(?:shut ?down|take down)\b.{0,20}\b(?:server|network|system)s?\b",
        r"\b(?:disable|turn off|bypass)\b.{0,20}"
        r"\b(?:firewall|antivirus|mfa|2fa|logging|security)\b",
    ),
    RiskFlag.PROMPT_INJECTION: _patterns(
        r"\b(?:ignore|disregard|forget|override|bypass)\b.{0,40}\b(?:instructions?|prompts?|rules?"
        r"|polic(?:y|ies)|guidelines?)\b",
        r"(?<!operating )\b(?:system|assistant|developer)\s*:",
        r"</?\s*(?:system|assistant|developer|instructions?)\b",
        r"\[/?(?:system|inst)\]",
        r"<{3}|>{3}|‹{3}|›{3}",
        r"\byou are now\b",
        r"\b(?:act|behave|respond) as\b.{0,20}\b(?:admin|administrator|system|root|developer)\b",
        r"\b(?:reveal|print|show|leak|repeat|output)\b.{0,30}\b(?:system prompt|prompt"
        r"|instructions|api keys?|keys|secrets?)\b",
        r"\bjailbreak\w*\b",
        r"\brequires_human_review\b",
        r"\b(?:set|mark|report)\b.{0,20}\bconfidence\b",
    ),
}

HARD_FLAGS = frozenset(HARD_SIGNALS)
# Requests with these flags get at least HIGH priority. PAYMENT is sensitive but is not a security
# event in itself.
SECURITY_FLAGS = HARD_FLAGS - {RiskFlag.PAYMENT}

_ASKS_FOR_SECRET = re.compile(
    r"\b(?:send|share|give|provide|tell|enter|confirm|reply with|respond with|type|email|verify"
    r"|submit|include|paste|text|supply|what is|what's)\b.{0,40}?\b" + _CONFIDENTIAL_NOUN + r"\b"
)
_NEGATED = re.compile(r"\b(?:never|not|don't|dont|avoid|without|no need to|won't|nobody)\b")
_CLAIMS_ACTION = re.compile(
    r"\b(?:i|we|i've|we've)\s+(?:have\s+|already\s+|just\s+)*(?:reset|deleted|removed|granted"
    r"|changed|updated|unlocked|disabled|enabled|restored|fixed|closed|created|wiped|escalated"
    r"|sent|approved|assigned|resolved|restarted|rebooted)\b"
    r"|\byour\b.{0,40}\b(?:has|have) been\b.{0,10}\b(?:reset|deleted|removed|granted|changed"
    r"|updated|unlocked|disabled|enabled|restored|fixed|wiped|approved)\b"
)
_CONTACT_DETAIL = re.compile(
    r"https?://[^\s<>\"')]+|\bwww\.[^\s<>\"')]+"
    r"|\b[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b"
    r"|(?<![\w.-])\+?\d[\d ().-]{6,}\d(?![\w-])"
)


def normalize_for_scan(text: str) -> str:
    """Remove simple obfuscation: compatibility forms, invisible characters and spacing."""
    normalized = unicodedata.normalize("NFKC", text)
    visible = "".join(ch for ch in normalized if unicodedata.category(ch) != "Cf")
    return re.sub(r"\s+", " ", visible).lower().strip()


def scan_request_text(redacted_text: str) -> set[RiskFlag]:
    text = normalize_for_scan(redacted_text)
    return {
        flag
        for flag, patterns in HARD_SIGNALS.items()
        if any(pattern.search(text) for pattern in patterns)
    }


def scan_article_text(text: str) -> bool:
    """Report whether retrieved article text holds instruction-like content."""
    normalized = normalize_for_scan(text)
    return any(pattern.search(normalized) for pattern in HARD_SIGNALS[RiskFlag.PROMPT_INJECTION])


def asks_for_credentials(text: str) -> bool:
    """Report whether a reply asks the reader for a secret. Warning against sharing one is fine."""
    normalized = normalize_for_scan(text)
    for match in _ASKS_FOR_SECRET.finditer(normalized):
        sentence_start = max(
            normalized.rfind(mark, 0, match.start()) for mark in (".", "!", "?", ";")
        )
        preceding = normalized[max(sentence_start + 1, match.start() - 30) : match.start()]
        if not _NEGATED.search(preceding):
            return True
    return False


def _normalize_contact(value: str) -> str:
    return re.sub(r"[^a-z0-9@./:]", "", value.lower()).rstrip("./:")


def has_unsupported_contact(reply: str, source_texts: Iterable[str]) -> bool:
    """Report URLs, emails or phone numbers in a reply that no cited article contains."""
    sources = _normalize_contact(" ".join(source_texts))
    return any(
        _normalize_contact(match.group()) not in sources
        for match in _CONTACT_DETAIL.finditer(reply.lower())
    )


def scan_model_reply(reply: str, cited_article_bodies: Iterable[str]) -> set[RiskFlag]:
    flags: set[RiskFlag] = set()
    if asks_for_credentials(reply):
        flags.add(RiskFlag.OUTPUT_ASKS_CREDENTIALS)
    if _CLAIMS_ACTION.search(normalize_for_scan(reply)):
        flags.add(RiskFlag.OUTPUT_CLAIMS_ACTION)
    if has_unsupported_contact(reply, cited_article_bodies):
        flags.add(RiskFlag.OUTPUT_UNSUPPORTED_CONTACT)
    return flags


@dataclass(frozen=True)
class PolicyDecision:
    risk_flags: list[RiskFlag]
    review_required: bool
    priority: Priority


def _at_least_high(priority: Priority) -> Priority:
    return Priority.HIGH if priority in (Priority.LOW, Priority.MEDIUM) else priority


def decide(
    *,
    redacted_text: str,
    result: TriageResult,
    valid_citation_count: int,
    dropped_citations: bool,
    retrieved_nothing: bool,
    retrieved_article_texts: Iterable[str],
    cited_article_bodies: Iterable[str],
    confidence_threshold: float,
) -> PolicyDecision:
    """Combine every signal. Flags only accumulate, so the model can add to them but never remove.

    Any flag means review, which is why `requires_human_review=false` cannot lower anything.
    """
    flags = set(result.risk_flags) | scan_request_text(redacted_text)
    flags |= scan_model_reply(result.recommended_reply, cited_article_bodies)
    if any(scan_article_text(text) for text in retrieved_article_texts):
        flags.add(RiskFlag.KB_CONTENT_SUSPECT)
    if result.confidence < confidence_threshold:
        flags.add(RiskFlag.LOW_CONFIDENCE)
    if retrieved_nothing:
        flags.add(RiskFlag.NO_RELEVANT_KNOWLEDGE)
    if valid_citation_count == 0:
        flags.add(RiskFlag.NO_CITATIONS)
    if dropped_citations:
        flags.add(RiskFlag.INVALID_CITATION)
    if result.requires_human_review:
        flags.add(RiskFlag.MODEL_REQUESTED_REVIEW)

    priority = _at_least_high(result.priority) if flags & SECURITY_FLAGS else result.priority
    return PolicyDecision(risk_flags=sorted(flags), review_required=bool(flags), priority=priority)
