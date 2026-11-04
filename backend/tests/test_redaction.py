import pytest

from app.services.redaction import redact, without_masks


@pytest.mark.parametrize(
    ("text", "mask", "leaked"),
    [
        ("Email me at riley.morgan@example.edu please", "[EMAIL]", "riley.morgan"),
        ("Call +1 555 201 7788 today", "[PHONE]", "201 7788"),
        ("Call (555) 201-7788 today", "[PHONE]", "201-7788"),
        ("Call 555-0142 today", "[PHONE]", "555-0142"),
        ("Call +15552017788 today", "[PHONE]", "5552017788"),
        ("Open https://portal.test/reset?token=abc123&u=9 now", "[URL]", "abc123"),
        ("Open https://admin:hunter2@portal.test/ now", "[URL]", "hunter2"),
        ("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl here", "[JWT]", "eyJhbGci"),
        ("hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822c", "[TOKEN]", "9f86d081"),
        ("blob QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1Njc4OTAxMjM0NTY= end", "[TOKEN]", "QWxhZGRp"),
        ("key sk-abcdefghijklmnop1234 end", "[API_KEY]", "abcdefghij"),
        ("key ghp_abcdefghijklmnop1234 end", "[API_KEY]", "abcdefghij"),
        ("key AKIAABCDEFGHIJKLMNOP end", "[API_KEY]", "AKIAABCD"),
        ("key AIzaSyA1234567890abcdefghijklmn end", "[API_KEY]", "AIzaSy"),
        ("key AQ.Ab12Cd34Ef56Gh78Ij90Kl end", "[API_KEY]", "Ab12Cd34"),
        ("card 4111 1111 1111 1111 expires", "[CARD]", "4111"),
        ("card 4111-1111-1111-1111 expires", "[CARD]", "4111"),
        ("password: hunter2 thanks", "password: [SECRET]", "hunter2"),
        ("pwd=hunter2 thanks", "pwd=[SECRET]", "hunter2"),
        ('PASSWORD = "two words" thanks', "PASSWORD = [SECRET]", "two words"),
        ("my password is hunter2 thanks", "password is [SECRET]", "hunter2"),
        ("recovery code: 1234-5678", "recovery code: [SECRET]", "1234"),
        ("api_key=abc123 thanks", "api_key=[SECRET]", "abc123"),
        ("Student ID 12345678 needs access", "[ID]", "12345678"),
        ("Asset 1234567 is broken", "[ID]", "1234567"),
        ("ref 3f2b8c1a-9d4e-4f6a-8b7c-1a2b3c4d5e6f here", "[ID]", "3f2b8c1a"),
    ],
)
def test_sensitive_values_are_masked(text: str, mask: str, leaked: str) -> None:
    redacted = redact(text)
    assert mask in redacted
    assert leaked not in redacted


@pytest.mark.parametrize(
    "text",
    [
        "The campus Wi-Fi connects but I cannot open websites.",
        "My laptop has been slow since 2026-11-04, room 204 on floor 3.",
        "The router at 192.168.1.10 needs a restart at 10:30.",
        "Version 1.2.3 of the app crashes with error 404.",
        "See https://support.example.test/wifi for the guide.",
        "My password is not working and my password is expired.",
        "I need to reset my password but the token page will not load.",
        "Ask about internationalization and counterrevolutionaries today.",
        "Asset 123456 is short enough to keep.",
    ],
)
def test_ordinary_text_is_untouched(text: str) -> None:
    assert redact(text) == text


def test_redaction_is_idempotent() -> None:
    once = redact("Email a@b.test, password: hunter2, card 4111 1111 1111 1111")
    assert redact(once) == once


def test_mask_tokens_are_removed_for_search() -> None:
    assert "EMAIL" not in without_masks("write to [EMAIL] about wifi")
    assert "wifi" in without_masks("write to [EMAIL] about wifi")
