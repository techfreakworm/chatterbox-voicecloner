"""Device auto-detection for Chatterbox.

Order: env override → cuda → mps → cpu.
"""
from __future__ import annotations

import os

import torch


_VALID = {"cuda", "mps", "cpu"}


def _cuda_available() -> bool:
    return torch.cuda.is_available()


def _mps_available() -> bool:
    backend = getattr(torch.backends, "mps", None)
    return bool(backend and backend.is_available())


def select_device() -> str:
    forced = (os.getenv("CHATTERBOX_DEVICE") or "").strip().lower()
    if forced in _VALID:
        return forced
    if _cuda_available():
        return "cuda"
    if _mps_available():
        return "mps"
    return "cpu"
