"""Seed helper for reproducible Chatterbox generations.

`apply_seed(seed)`:
  - if `seed` is `None` or `< 0`, draw a fresh non-negative 31-bit int
  - call torch / cuda / mps / pyrandom seeding APIs with the chosen seed
  - return the seed that was actually used (so the endpoint can echo it back)

Failures inside platform-specific seeding (e.g. mps not present) are
swallowed — the helper is best-effort, not a contract for determinism
across hardware.
"""
from __future__ import annotations

import random
from typing import Optional

import torch


def _maybe_seed_mps(seed: int) -> None:
    mps = getattr(torch, "mps", None)
    if mps is None:
        return
    fn = getattr(mps, "manual_seed", None)
    if fn is None:
        return
    fn(seed)


def apply_seed(seed: Optional[int]) -> int:
    if seed is None or seed < 0:
        seed = random.randint(0, 2**31 - 1)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    try:
        _maybe_seed_mps(seed)
    except Exception:
        pass
    random.seed(seed)
    return seed
