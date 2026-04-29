"""Dialog mode: parse SPEAKER X: scripts into ordered turns and stitch
per-turn outputs into a single concatenated WAV.

Generator is in this same file but added in Task 12.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


_SPEAKER_RE = re.compile(r"^\s*SPEAKER\s+([A-D])\s*:\s*", re.MULTILINE)


@dataclass(frozen=True)
class DialogTurn:
    speaker: str   # "A" | "B" | "C" | "D"
    text: str


class DialogParseError(ValueError):
    """Raised when a dialog script can't be parsed into turns."""


def parse_dialog(text: str) -> list[DialogTurn]:
    matches = list(_SPEAKER_RE.finditer(text))
    if not matches:
        raise DialogParseError(
            "Use SPEAKER A: ... / SPEAKER B: ... lines to define turns."
        )
    turns: list[DialogTurn] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        if block:
            turns.append(DialogTurn(speaker=m.group(1), text=block))
    if not turns:
        raise DialogParseError("No non-empty speaker turns found.")
    return turns
