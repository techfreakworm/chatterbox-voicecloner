import random as pyrandom
from unittest.mock import patch

from server.seed import apply_seed


def test_apply_seed_returns_provided_value():
    assert apply_seed(42) == 42
    assert apply_seed(0) == 0


def test_apply_seed_negative_draws_random():
    s = apply_seed(-1)
    assert isinstance(s, int)
    assert 0 <= s < 2**31


def test_apply_seed_none_draws_random():
    s = apply_seed(None)
    assert isinstance(s, int)
    assert 0 <= s < 2**31


def test_apply_seed_seeds_pyrandom_so_repeats_match():
    s = apply_seed(123)
    a = pyrandom.random()
    apply_seed(s)
    b = pyrandom.random()
    assert a == b


def test_apply_seed_calls_torch_manual_seed():
    with patch("server.seed.torch.manual_seed") as m:
        apply_seed(99)
    m.assert_called_once_with(99)


def test_apply_seed_swallows_mps_failure():
    with patch("server.seed._maybe_seed_mps", side_effect=RuntimeError("nope")):
        # Should not raise
        s = apply_seed(7)
        assert s == 7
