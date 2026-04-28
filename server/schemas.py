"""Pydantic models for the public API."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


ParamType = Literal["float", "int", "bool", "enum"]
ModelStatus = Literal["idle", "loading", "loaded", "error"]


class Lang(BaseModel):
    code: str
    label: str


class ParamSpec(BaseModel):
    name: str
    label: str
    type: ParamType
    default: float | int | bool | str
    min: float | int | None = None
    max: float | int | None = None
    step: float | int | None = None
    choices: list[str] | None = None
    help: str = ""

    @model_validator(mode="after")
    def _validate(self) -> "ParamSpec":
        if self.type == "enum":
            if not self.choices:
                raise ValueError("enum params must define `choices`")
            if self.default not in self.choices:
                raise ValueError("enum default must appear in `choices`")
        if self.type in {"float", "int"}:
            if self.min is not None and isinstance(self.default, (int, float)) and self.default < self.min:
                raise ValueError("default below min")
            if self.max is not None and isinstance(self.default, (int, float)) and self.default > self.max:
                raise ValueError("default above max")
        return self


class ModelInfo(BaseModel):
    id: str
    label: str
    description: str
    languages: list[Lang]
    paralinguistic_tags: list[str]
    supports_voice_clone: bool
    params: list[ParamSpec]


class ActiveModelStatus(BaseModel):
    id: str | None
    status: ModelStatus
    last_error: str | None = None


class HealthResponse(BaseModel):
    device: str
    torch_version: str
    model_status: ModelStatus


class ErrorBody(BaseModel):
    error: dict[str, Any] = Field(
        ...,
        description="{code, message, detail?}",
    )


class GenerateParams(BaseModel):
    """Free-form param bag — adapter-specific."""
    values: dict[str, Any] = {}
