from pydantic import AfterValidator, BaseModel, ConfigDict


def _reject_nul(value: str) -> str:
    # PostgreSQL text cannot hold NUL. Without this check the driver raises and the API returns 500.
    if "\x00" in value:
        raise ValueError("must not contain NUL characters")
    return value


# Put this after any length constraints: Annotated[str, StringConstraints(...), NoNul].
# Wrapping an already-validated type in StringConstraints silently drops strip and length rules.
NoNul = AfterValidator(_reject_nul)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StrictInput(BaseModel):
    """Base for request bodies. Unknown fields are rejected, not silently ignored."""

    model_config = ConfigDict(extra="forbid")


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int
