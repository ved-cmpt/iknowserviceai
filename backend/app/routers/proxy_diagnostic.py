"""Temporary, removed in the next commit: the shape of the proxy headers, for the rate limiter.

Admin only. Returns salted hashes and classifications, never an address.
"""

import hashlib
import hmac
import ipaddress
import secrets

from fastapi import APIRouter, Depends, Request

from app.core.deps import require_roles
from app.db.models.enums import Role

router = APIRouter(prefix="/admin", tags=["admin"])

_SALT = secrets.token_bytes(32)
_CLOUDFLARE = [
    ipaddress.ip_network(block)
    for block in (
        "173.245.48.0/20",
        "103.21.244.0/22",
        "103.22.200.0/22",
        "103.31.4.0/22",
        "141.101.64.0/18",
        "108.162.192.0/18",
        "190.93.240.0/20",
        "188.114.96.0/20",
        "197.234.240.0/22",
        "198.41.128.0/17",
        "162.158.0.0/15",
        "104.16.0.0/13",
        "104.24.0.0/14",
        "172.64.0.0/13",
        "131.0.72.0/22",
    )
]
_HEADERS = ("cf-connecting-ip", "true-client-ip", "x-real-ip", "x-envoy-external-address")


def _describe(value: str | None) -> dict | None:
    if value is None:
        return None
    described = {
        "hash": hmac.new(_SALT, value.encode(), hashlib.sha256).hexdigest()[:10],
        "forged": value.startswith("203.0.113."),
    }
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return {**described, "kind": "not-an-address"}
    if address.is_private:
        kind = "private"
    elif address.version == 4 and any(address in block for block in _CLOUDFLARE):
        kind = "cloudflare"
    else:
        kind = "public"
    return {**described, "kind": kind}


@router.get("/proxy-shape", dependencies=[Depends(require_roles(Role.ADMIN))])
def proxy_shape(request: Request) -> dict:
    lines = [v.decode("latin1") for k, v in request.scope["headers"] if k == b"x-forwarded-for"]
    entries = [part.strip() for line in lines for part in line.split(",") if part.strip()]
    return {
        "xff_lines": len(lines),
        "xff": [_describe(entry) for entry in entries],
        "headers": {name: _describe(request.headers.get(name)) for name in _HEADERS},
        "client": _describe(request.client.host if request.client else None),
    }
