"""Application settings, validated once at startup."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

PLACEHOLDER_MARKERS = ("replace-with", "changeme", "change-me")
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", frozen=True)

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str
    jwt_secret: str
    access_token_minutes: int = Field(default=30, ge=1, le=1440)
    cors_allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    ai_mode: Literal["mock", "gemini"] = "mock"

    kb_min_rank: float = Field(default=0.05, ge=0)

    demo_password: str | None = None
    allow_demo_reset: bool = False

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_allowed_origins")
    @classmethod
    def reject_wildcard_origin(cls, value: list[str]) -> list[str]:
        if "*" in value:
            raise ValueError("CORS_ALLOWED_ORIGINS must list explicit origins, not *")
        return value

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> "Settings":
        if len(self.jwt_secret) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(f"JWT_SECRET must be at least {MIN_JWT_SECRET_LENGTH} characters")
        lowered = self.jwt_secret.lower()
        if self.is_production and any(marker in lowered for marker in PLACEHOLDER_MARKERS):
            raise ValueError("JWT_SECRET still holds a placeholder value")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
