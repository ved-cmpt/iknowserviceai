"""Application settings, validated once at startup."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

PLACEHOLDER_MARKERS = ("replace-with", "changeme", "change-me")
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    # hide_input_in_errors keeps secrets out of startup failure messages.
    model_config = SettingsConfigDict(extra="ignore", frozen=True, hide_input_in_errors=True)

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str
    jwt_secret: str
    access_token_minutes: int = Field(default=30, ge=1, le=1440)
    cors_allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    ai_mode: Literal["mock", "gemini"] = "mock"
    # SecretStr keeps the key out of reprs and logs. Read it only where the SDK client is built.
    gemini_api_key: SecretStr | None = None
    gemini_model: str | None = None
    ai_request_timeout_seconds: float = Field(default=20, gt=0, le=120)
    ai_max_output_tokens: int = Field(default=1024, ge=128, le=8192)
    ai_review_confidence_threshold: float = Field(default=0.70, ge=0, le=1)
    ai_max_analyze_attempts: int = Field(default=3, ge=1, le=20)
    ai_stale_run_seconds: int = Field(default=120, ge=1)

    kb_min_rank: float = Field(default=0.5, ge=0)  # See ADR-016 for the measurements.

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

    @model_validator(mode="after")
    def validate_gemini_settings(self) -> "Settings":
        if self.ai_mode != "gemini":
            return self
        if self.gemini_api_key is None or not self.gemini_api_key.get_secret_value().strip():
            raise ValueError("AI_MODE=gemini requires GEMINI_API_KEY")
        if not self.gemini_model or self.gemini_model.startswith("<"):
            raise ValueError("AI_MODE=gemini requires GEMINI_MODEL")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
