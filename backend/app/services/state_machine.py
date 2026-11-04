"""The request state machine (blueprint section 4.3, ADR-012). All transition rules live here."""

from app.core.errors import conflict
from app.db.models.enums import RequestStatus as S

# Transitions staff may make through PATCH. ANALYZING appears in no entry: only the AI service
# may set it or leave it. CLOSED has no exits because it is terminal.
STAFF_TRANSITIONS: dict[S, frozenset[S]] = {
    S.NEW: frozenset({S.TRIAGED, S.NEEDS_HUMAN_REVIEW}),
    S.ANALYZING: frozenset(),
    S.TRIAGED: frozenset({S.IN_PROGRESS, S.NEEDS_HUMAN_REVIEW}),
    S.NEEDS_HUMAN_REVIEW: frozenset({S.TRIAGED, S.IN_PROGRESS}),
    S.IN_PROGRESS: frozenset({S.RESOLVED, S.NEEDS_HUMAN_REVIEW}),
    S.RESOLVED: frozenset({S.CLOSED, S.NEEDS_HUMAN_REVIEW}),
    S.CLOSED: frozenset(),
}

# Transitions reserved for the AI service.
SYSTEM_TRANSITIONS: dict[S, frozenset[S]] = {
    S.NEW: frozenset({S.ANALYZING}),
    S.ANALYZING: frozenset({S.TRIAGED, S.NEEDS_HUMAN_REVIEW, S.NEW}),
}


def ensure_system_transition(current: S, target: S) -> None:
    if target not in SYSTEM_TRANSITIONS.get(current, frozenset()):
        raise conflict(
            "INVALID_TRANSITION",
            f"A request cannot move from {current.value} to {target.value}",
        )


def can_staff_transition(current: S, target: S) -> bool:
    return target in STAFF_TRANSITIONS[current]


def ensure_staff_transition(current: S, target: S) -> None:
    if not can_staff_transition(current, target):
        raise conflict(
            "INVALID_TRANSITION",
            f"A request cannot move from {current.value} to {target.value}",
        )
