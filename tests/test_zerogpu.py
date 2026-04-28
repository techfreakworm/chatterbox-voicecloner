import sys
from unittest.mock import MagicMock

from server.zerogpu import decorate


def test_decorate_is_passthrough_when_spaces_missing(monkeypatch):
    monkeypatch.setitem(sys.modules, "spaces", None)

    @decorate
    def fn(x):
        return x * 2

    assert fn(3) == 6


def test_decorate_uses_spaces_gpu_when_available(monkeypatch):
    fake_spaces = MagicMock()
    fake_decorator = MagicMock(side_effect=lambda f: f)
    fake_spaces.GPU = MagicMock(return_value=fake_decorator)
    monkeypatch.setitem(sys.modules, "spaces", fake_spaces)

    import importlib
    import server.zerogpu as zg

    importlib.reload(zg)

    @zg.decorate
    def fn(x):
        return x + 1

    assert fn(2) == 3
    fake_spaces.GPU.assert_called_once()
