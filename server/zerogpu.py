"""ZeroGPU decorator shim.

When `spaces` is importable (HF ZeroGPU runtime), `decorate` wraps
functions with `spaces.GPU(duration=...)`. Otherwise it is the
identity decorator. Local installs and Free CPU Spaces hit the
no-op branch.
"""
from __future__ import annotations

from typing import Callable, TypeVar


F = TypeVar("F", bound=Callable)


try:  # pragma: no cover — covered by a test that injects a fake module
    import spaces  # type: ignore[import-not-found]

    def decorate(fn: F) -> F:
        return spaces.GPU(duration=120)(fn)  # type: ignore[no-any-return]

except ImportError:  # local / Free CPU

    def decorate(fn: F) -> F:
        return fn
