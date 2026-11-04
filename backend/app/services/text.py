"""Plain-text snippets from article markdown.

Snippets contain no markup, so no consumer has to sanitize them. This is not a security boundary
for the full article body, which is stored verbatim and must be rendered safely by its consumer.
"""

import re

_SCRIPT_OR_STYLE = re.compile(r"<(script|style)\b[^>]*>.*?(</\1\s*>|$)", re.IGNORECASE | re.DOTALL)
_HTML_TAG = re.compile(r"</?[a-zA-Z!][^>]*>?")
_FENCE_MARKER = re.compile(r"^\s*(```|~~~).*$", re.MULTILINE)
_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)
_BLOCKQUOTE = re.compile(r"^\s{0,3}>\s?", re.MULTILINE)
_LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+", re.MULTILINE)
_RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", re.MULTILINE)
_EMPHASIS = re.compile(r"(\*{1,3}|_{2,3}|~~|`+)")
_ANGLE_BRACKETS = re.compile(r"[<>]")
_WHITESPACE = re.compile(r"\s+")


def markdown_to_plain_text(markdown: str) -> str:
    text = _SCRIPT_OR_STYLE.sub(" ", markdown)
    text = _HTML_TAG.sub(" ", text)
    text = _FENCE_MARKER.sub(" ", text)
    text = _IMAGE.sub(r"\1", text)
    text = _LINK.sub(r"\1", text)
    text = _RULE.sub(" ", text)
    text = _HEADING.sub("", text)
    text = _BLOCKQUOTE.sub("", text)
    text = _LIST_MARKER.sub("", text)
    text = _EMPHASIS.sub("", text)
    text = _ANGLE_BRACKETS.sub(" ", text)
    return _WHITESPACE.sub(" ", text).strip()


def make_snippet(markdown: str, max_length: int) -> str:
    """Return the leading plain text, cut at a word boundary, never longer than max_length."""
    text = markdown_to_plain_text(markdown)
    if len(text) <= max_length:
        return text
    cut = text[: max_length - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return f"{cut.rstrip()}…"
