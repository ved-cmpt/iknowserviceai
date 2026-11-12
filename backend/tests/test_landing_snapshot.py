"""The website's data snapshot matches what the code does today (ADR-064).

A fresh snapshot is built on a fresh seed, inside a transaction that is rolled back, and compared
with the committed file. If this fails after a deliberate change, regenerate the file:
python scripts/landing_snapshot.py
"""

import copy
import json
import os
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.db.models import ServiceRequest
from app.db.session import SessionLocal, engine
from app.scripts.landing_snapshot import build_snapshot, differences, normalize

# The repository checkout in CI, and a read-only mount in the development stack (compose.yaml).
CANDIDATES = [
    os.environ.get("LANDING_SNAPSHOT_PATH", ""),
    str(Path(__file__).resolve().parents[2] / "frontend/public/data/landing-snapshot.json"),
    "/frontend-data/landing-snapshot.json",
]


def committed_snapshot() -> dict:
    for candidate in filter(None, CANDIDATES):
        if Path(candidate).is_file():
            return json.loads(Path(candidate).read_text(encoding="utf-8"))
    pytest.fail(f"The committed snapshot was not found. Looked in: {CANDIDATES}")


@pytest.fixture(scope="module")
def fresh() -> dict:
    with engine.connect() as connection:
        return build_snapshot(connection, commit="test")


def test_the_committed_snapshot_matches_a_fresh_run(fresh: dict) -> None:
    assert differences(normalize(committed_snapshot()), normalize(fresh)) == []


def test_the_check_notices_a_change(fresh: dict) -> None:
    changed = copy.deepcopy(fresh)
    changed["scenarios"]["sensitive"]["policy"]["review_state"] = "NOT_REQUIRED"
    assert differences(normalize(fresh), normalize(changed)) == [
        "$.scenarios.sensitive.policy.review_state"
    ]


def test_building_it_leaves_nothing_behind() -> None:
    with SessionLocal() as db:
        before = db.scalar(select(func.count()).select_from(ServiceRequest))
    with engine.connect() as connection:
        build_snapshot(connection)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ServiceRequest)) == before


def test_the_ordinary_request_gets_a_cited_ai_suggestion(fresh: dict) -> None:
    ordinary = fresh["scenarios"]["ordinary"]
    assert "[EMAIL]" in ordinary["redacted"]["description"]
    assert "[PHONE]" in ordinary["redacted"]["description"]
    assert "example.com" not in ordinary["redacted"]["description"]
    assert ordinary["redacted"]["matches_stored_run"] is True
    assert ordinary["policy"]["review_state"] == "NOT_REQUIRED"
    assert ordinary["validation"]["citations_kept"] == ordinary["provider_output"]["citations"]
    view = ordinary["requester_view"]
    assert view["suggestion_state"] == "AVAILABLE"
    assert view["suggestion"]["source"] == "AI"
    assert len(view["suggestion"]["citations"]) == 1


def test_the_sensitive_request_is_held_by_code_and_shows_the_requester_nothing(fresh: dict) -> None:
    sensitive = fresh["scenarios"]["sensitive"]
    # The model did not ask for review. The code held it anyway.
    assert sensitive["provider_output"]["requires_human_review"] is False
    assert "ACCOUNT_COMPROMISE" in sensitive["policy"]["input_scan_flags"]
    assert sensitive["policy"]["review_state"] == "PENDING_REVIEW"
    assert sensitive["requester_view"]["suggestion_state"] == "AWAITING_STAFF_REVIEW"
    assert sensitive["requester_view"]["suggestion"] is None
    assert sensitive["staff_view"]["suggestion"]["proposed_reply"]


def test_the_injection_is_flagged_and_nothing_is_executed(fresh: dict) -> None:
    injection = fresh["scenarios"]["injection"]
    assert injection["policy"]["final_flags"] == ["PROMPT_INJECTION"]
    assert injection["policy"]["status_after"] == "NEEDS_HUMAN_REVIEW"
    assert injection["requester_view"]["status"] != "RESOLVED"
    assert injection["requester_view"]["suggestion"] is None


def test_staff_cannot_publish_a_credential_request_but_can_publish_a_safe_reply(
    fresh: dict,
) -> None:
    unsafe, safe = fresh["scenarios"]["staff_review"]["attempts"]
    assert (unsafe["accepted"], unsafe["http_status"], unsafe["error_code"]) == (
        False,
        422,
        "UNSAFE_REPLY",
    )
    assert safe["accepted"] is True
    suggestion = safe["requester_view"]["suggestion"]
    assert suggestion["source"] == "STAFF_REVIEWED"
    assert suggestion["label"] == "Reviewed by the support team"
    assert suggestion["reply"] == safe["reply"]
