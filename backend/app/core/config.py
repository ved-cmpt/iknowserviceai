"""Application settings, validated once at startup."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

PLACEHOLDER_MARKERS = ("replace-with", "changeme", "change-me")
MIN_JWT_SECRET_LENGTH = 32
MIN_JWT_SECRET_DISTINCT_CHARACTERS = 12


class Settings(BaseSettings):
    # hide_input_in_errors keeps secrets out of startup failure messages.
    model_config = SettingsConfigDict(extra="ignore", frozen=True, hide_input_in_errors=True)

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str
    # The owner role, used only by migrations and the demo reset. The running app has no need for
    # it and should not be given it (ADR-047).
    migration_database_url: str | None = None
    jwt_secret: str
    # Short, because a token cannot be revoked before it expires. Refresh keeps people signed in.
    access_token_minutes: int = Field(default=10, ge=1, le=1440)
    refresh_token_hours: int = Field(default=8, ge=1, le=720)
    cors_allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # The built frontend, served from the same origin as the API (ADR-044). Unset in development.
    static_dir: str | None = None
    # How many trusted proxies sit in front of the app. 0 ignores X-Forwarded-For entirely.
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)
    # Send Strict-Transport-Security. Turn on only when the site is served over HTTPS.
    hsts_enabled: bool = False
    # A public demo: shows the sign-in help and banner, and turns on the safeguards below (ADR-051).
    # Development always shows the sign-in help, and nothing else.
    demo_mode: bool = False
    demo_reset_interval_hours: int = Field(default=24, ge=1, le=720)
    demo_max_requests_per_account_per_day: int = Field(default=20, ge=1)
    demo_max_requests_total: int = Field(default=300, ge=1)
    demo_max_articles: int = Field(default=30, ge=1)

    ai_mode: Literal["mock", "gemini"] = "mock"
    # SecretStr keeps the key out of reprs and logs. Read it only where the SDK client is built.
    gemini_api_key: SecretStr | None = None
    gemini_model: str | None = None
    # The owner's one passing live call took about 15 seconds (ADR-029), so 20 left little margin.
    ai_request_timeout_seconds: float = Field(default=45, gt=0, le=120)
    ai_max_output_tokens: int = Field(default=2048, ge=128, le=8192)
    # "low" is the one low setting that every current Flash model accepts (ADR-029).
    ai_thinking_level: Literal["minimal", "low", "medium", "high"] = "low"
    ai_review_confidence_threshold: float = Field(default=0.70, ge=0, le=1)
    ai_max_analyze_attempts: int = Field(default=3, ge=1, le=20)
    ai_stale_run_seconds: int = Field(default=120, ge=1)

    kb_min_rank: float = Field(default=0.5, ge=0)  # See ADR-016 for the measurements.

    rate_limit_login_per_minute: int = Field(default=5, ge=1)
    rate_limit_analyze_per_hour: int = Field(default=10, ge=1)
    rate_limit_refresh_per_minute: int = Field(default=60, ge=1)

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
        if self.is_production:
            if any(marker in lowered for marker in PLACEHOLDER_MARKERS):
                raise ValueError("JWT_SECRET still holds a placeholder value")
            if len(set(self.jwt_secret)) < MIN_JWT_SECRET_DISTINCT_CHARACTERS:
                raise ValueError("JWT_SECRET is too repetitive. Generate a random value")
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

    @property
    def show_demo_help(self) -> bool:
        return self.demo_mode or not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()
