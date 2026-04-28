import pytest

from server.models.base import (
    Lang,
    ModelAdapter,
    ParamSpec,
    is_valid_adapter,
)


class FakeOk(ModelAdapter):
    id = "fake-ok"
    label = "Fake OK"
    description = "Test"
    languages = [Lang(code="en", label="English")]
    paralinguistic_tags: list[str] = []
    supports_voice_clone = True
    params = [ParamSpec(name="t", label="T", type="float", default=0.5, min=0.0, max=1.0)]

    def __init__(self, device: str): self.device = device
    def load(self): ...
    def unload(self): ...
    def generate(self, text, reference_wav_path, language, params):
        return (b"fake", 24000)


def test_is_valid_adapter_accepts_fake():
    assert is_valid_adapter(FakeOk) is True


def test_is_valid_adapter_rejects_missing_id():
    class Bad(ModelAdapter):
        id = ""
        label = "X"
        description = "X"
        languages: list[Lang] = []
        paralinguistic_tags: list[str] = []
        supports_voice_clone = False
        params: list[ParamSpec] = []
        def __init__(self, device): ...
        def load(self): ...
        def unload(self): ...
        def generate(self, *a, **k): return (b"", 0)
    assert is_valid_adapter(Bad) is False


def test_param_spec_defaults_validated():
    with pytest.raises(ValueError):
        ParamSpec(name="t", label="T", type="float", default=2.0, min=0.0, max=1.0)


def test_lang_dataclass():
    l = Lang(code="hi", label="Hindi")
    assert (l.code, l.label) == ("hi", "Hindi")
