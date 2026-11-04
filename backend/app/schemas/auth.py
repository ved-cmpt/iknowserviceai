import uuid
from typing import Annotated

from pydantic import Field

from app.db.models.enums import Role
from app.schemas.common import NoNulStr, ORMModel, StrictInput


class LoginInput(StrictInput):
    # A plain string: the demo domain uses the reserved .test TLD, which email validators reject.
    email: Annotated[NoNulStr, Field(min_length=3, max_length=254)]
    password: Annotated[NoNulStr, Field(min_length=1, max_length=1024)]


class UserProfile(ORMModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: Role


class LoginResponse(ORMModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 - the OAuth token type, not a credential
    expires_in: int
    user: UserProfile
