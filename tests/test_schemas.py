import pytest
from pydantic import ValidationError

from server.schemas import (
    ActiveModelStatus,
    ErrorBody,
    GenerateParams,
    HealthResponse,
    Lang,
    ModelInfo,
    ParamSpec,
)


def test_param_spec_float_with_bounds():
    p = ParamSpec(
        name="exaggeration",
        label="Exaggeration",
        type="float",
        default=0.5,
        min=0.0,
        max=2.0,
        step=0.05,
    )
    assert p.default == 0.5


def test_param_spec_enum_requires_choices():
    with pytest.raises(ValidationError):
        ParamSpec(name="lang", label="Lang", type="enum", default="en")


def test_param_spec_enum_default_must_be_in_choices():
    with pytest.raises(ValidationError):
        ParamSpec(
            name="lang",
            label="Lang",
            type="enum",
            default="zz",
            choices=["en", "fr"],
        )


def test_param_spec_float_default_within_bounds():
    with pytest.raises(ValidationError):
        ParamSpec(name="x", label="X", type="float", default=99.0, min=0.0, max=1.0)


def test_model_info_round_trip():
    info = ModelInfo(
        id="chatterbox-en",
        label="Chatterbox English",
        description="English voice cloning",
        languages=[Lang(code="en", label="English")],
        paralinguistic_tags=[],
        supports_voice_clone=True,
        params=[
            ParamSpec(name="cfg_weight", label="CFG", type="float", default=0.5, min=0.0, max=1.0)
        ],
    )
    dumped = info.model_dump()
    assert dumped["id"] == "chatterbox-en"


def test_active_model_status_idle():
    s = ActiveModelStatus(id=None, status="idle", last_error=None)
    assert s.status == "idle"


def test_health_response_minimal():
    h = HealthResponse(device="cpu", torch_version="2.4.1", model_status="idle")
    assert h.device == "cpu"


def test_error_body_serializable():
    e = ErrorBody(error={"code": "model_not_found", "message": "x", "detail": None})
    assert e.error["code"] == "model_not_found"


def test_generate_params_accepts_arbitrary_dict():
    g = GenerateParams(values={"temperature": 0.8, "cfg_weight": 0.5})
    assert g.values["temperature"] == 0.8
