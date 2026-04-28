import importlib

import pytest

from server.models.base import is_valid_adapter
from server.schemas import ParamSpec


ADAPTER_MODULES = [
    "server.models.chatterbox_en",
    "server.models.chatterbox_turbo",
    "server.models.chatterbox_mtl",
]


@pytest.mark.parametrize("module_name", ADAPTER_MODULES)
def test_adapter_class_attributes_valid(module_name):
    mod = importlib.import_module(module_name)
    cls = getattr(mod, "Adapter")
    assert is_valid_adapter(cls)
    assert cls.id
    for p in cls.params:
        assert isinstance(p, ParamSpec)
