"""ModelAdapter interface and supporting types.

Re-exports `Lang` and `ParamSpec` from `server.schemas` so that
adapter modules and the API layer share a single source of truth.
"""
from __future__ import annotations

from typing import Any, ClassVar, Protocol, runtime_checkable

from server.schemas import Lang, ParamSpec


@runtime_checkable
class ModelAdapter(Protocol):
    id: ClassVar[str]
    label: ClassVar[str]
    description: ClassVar[str]
    languages: ClassVar[list[Lang]]
    paralinguistic_tags: ClassVar[list[str]]
    supports_voice_clone: ClassVar[bool]
    params: ClassVar[list[ParamSpec]]

    def __init__(self, device: str) -> None: ...
    def load(self) -> None: ...
    def unload(self) -> None: ...
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int, int]: ...   # (wav_bytes, sample_rate, seed_used)


def is_valid_adapter(cls: type) -> bool:
    """Quick declarative-fields check (does not require instantiation)."""
    required = (
        "id",
        "label",
        "description",
        "languages",
        "paralinguistic_tags",
        "supports_voice_clone",
        "params",
    )
    if not all(hasattr(cls, n) for n in required):
        return False
    if not getattr(cls, "id", "").strip():
        return False
    if not isinstance(getattr(cls, "languages"), list):
        return False
    if not isinstance(getattr(cls, "params"), list):
        return False
    return True
