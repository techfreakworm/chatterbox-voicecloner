# Chatterbox Voice Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-platform browser-based voice cloning studio for the Chatterbox TTS model family (English, Turbo, Multilingual), with a polished React/Tailwind UI, FastAPI backend, browser-side persistence, one-click launchers for macOS/Linux/Windows, and a Hugging Face Spaces Dockerfile.

**Architecture:** FastAPI serves three Chatterbox model adapters behind a single-active-model registry; same Python codebase runs locally on cuda/mps/cpu and on HF Spaces (Free CPU default, ZeroGPU-decorator-ready). React + Vite + Tailwind + shadcn/ui SPA built ahead-of-time and served as static files from FastAPI. Server is **stateless**; voices and history live in browser IndexedDB (Dexie).

**Tech Stack:** Python 3.11, FastAPI, uvicorn, chatterbox-tts, soundfile, torch; React 18, TypeScript, Vite, Tailwind, shadcn/ui, Dexie; Docker for HF Spaces deploy.

**Repo:** `/Users/techfreakworm/Projects/llm/chatterbox-voicecloner`

**Spec:** `docs/superpowers/specs/2026-04-28-chatterbox-voice-studio-design.md`

**Repo conventions (from `CLAUDE.md`):**
- Sole author on every commit is Mayank Gupta — never include a `Co-Authored-By: Claude ...` trailer or "Generated with Claude Code" footer in commit messages or PR bodies.
- Server is stateless. No DB on the server.
- Multi-platform: must run on mac (MPS), linux (CUDA/CPU), windows (CUDA/CPU), HF Spaces Free CPU.

---

## File Structure

```
chatterbox-voicecloner/
├── CLAUDE.md                                (already exists)
├── README.md                                (Task 31)
├── .gitignore                               (Task 1)
├── .python-version                          (Task 1)
├── pytest.ini                               (Task 1)
├── requirements.txt                         (Task 1)
├── Dockerfile                               (Task 30)
├── .dockerignore                            (Task 30)
├── server/
│   ├── __init__.py                          (Task 1)
│   ├── device.py                            (Task 2)
│   ├── audio.py                             (Task 3)
│   ├── schemas.py                           (Task 4)
│   ├── zerogpu.py                           (Task 5)
│   ├── registry.py                          (Task 7)
│   ├── main.py                              (Tasks 8, 9, 10, 13)
│   ├── static/                              (populated by build, Task 28+)
│   └── models/
│       ├── __init__.py                      (Task 6)
│       ├── base.py                          (Task 6)
│       ├── chatterbox_en.py                 (Task 11)
│       ├── chatterbox_turbo.py              (Task 12)
│       └── chatterbox_mtl.py                (Task 13)
├── tests/
│   ├── __init__.py                          (Task 1)
│   ├── conftest.py                          (Task 7)
│   ├── test_device.py                       (Task 2)
│   ├── test_audio.py                        (Task 3)
│   ├── test_schemas.py                      (Task 4)
│   ├── test_zerogpu.py                      (Task 5)
│   ├── test_models_base.py                  (Task 6)
│   ├── test_registry.py                     (Task 7)
│   ├── test_main_health.py                  (Task 8)
│   ├── test_main_models.py                  (Task 9)
│   ├── test_main_activate.py                (Task 10)
│   ├── test_main_generate.py                (Task 11)
│   └── test_adapter_contract.py             (Tasks 11, 12, 13)
├── web/
│   ├── package.json                         (Task 15)
│   ├── tsconfig.json                        (Task 15)
│   ├── tsconfig.node.json                   (Task 15)
│   ├── vite.config.ts                       (Task 15)
│   ├── tailwind.config.ts                   (Task 15)
│   ├── postcss.config.cjs                   (Task 15)
│   ├── components.json                      (Task 15)
│   ├── index.html                           (Task 15)
│   └── src/
│       ├── main.tsx                         (Task 16)
│       ├── App.tsx                          (Task 16)
│       ├── styles/index.css                 (Task 16)
│       ├── lib/
│       │   ├── api.ts                       (Task 17)
│       │   ├── idb.ts                       (Task 18)
│       │   ├── audio.ts                     (Task 19)
│       │   └── theme.ts                     (Task 16)
│       ├── components/
│       │   ├── ui/*                         (Task 15 — shadcn add primitives)
│       │   ├── ParamsPanel.tsx              (Task 20)
│       │   ├── TagBar.tsx                   (Task 21)
│       │   ├── ModelPicker.tsx              (Task 22)
│       │   ├── VoiceLibrary.tsx             (Task 23)
│       │   ├── HistoryList.tsx              (Task 24)
│       │   ├── VoiceComposer.tsx            (Task 25)
│       │   ├── DeviceBadge.tsx              (Task 22)
│       │   └── LoadingBanner.tsx            (Task 27)
│       ├── pages/Studio.tsx                 (Tasks 16, 26)
│       └── test/
│           ├── api.test.ts                  (Task 17)
│           ├── idb.test.ts                  (Task 18)
│           ├── audio.test.ts                (Task 19)
│           ├── ParamsPanel.test.tsx         (Task 20)
│           └── TagBar.test.tsx              (Task 21)
├── scripts/
│   ├── start.sh                             (Task 28)
│   ├── start.ps1                            (Task 29)
│   ├── start.bat                            (Task 29)
│   └── smoke.sh                             (Task 14)
└── docs/superpowers/
    ├── specs/2026-04-28-chatterbox-voice-studio-design.md   (already exists)
    └── plans/2026-04-29-chatterbox-voice-studio-plan.md     (this file)
```

**Commit policy:** Mayank as sole author. Use `git commit -m "<msg>"` with **no** `--author` override and **no** `Co-Authored-By:` trailer. Body should describe what changed and why. Conventional commit prefixes: `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`.

**TDD:** All Python logic that is testable without GPU/torch loading is written test-first. Real-model integration (adapter `generate()` against actual Chatterbox weights) is verified manually via `scripts/smoke.sh` — not in unit tests.

---

## Task 1: Repo scaffold + Python environment

**Files:**
- Create: `requirements.txt`, `.python-version`, `.gitignore`, `pytest.ini`
- Create: `server/__init__.py`, `server/models/__init__.py`, `tests/__init__.py`

- [ ] **Step 1: Create `.python-version`**

```
3.11
```

- [ ] **Step 2: Create `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
python-multipart==0.0.9
soundfile==0.12.1
numpy==1.26.4
torch==2.4.1
chatterbox-tts==0.1.4
huggingface_hub==0.25.2
sse-starlette==2.1.3

# dev
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

> Note on the `chatterbox-tts` version: pinning is best-effort. If the pinned version doesn't expose all three classes (`ChatterboxTTS`, `ChatterboxTurboTTS`, `ChatterboxMultilingualTTS`), Task 11–13 will switch to `git+https://github.com/resemble-ai/chatterbox`. Adapt then; do not pre-emptively change here.

- [ ] **Step 3: Create `.gitignore`**

```
# Python
__pycache__/
*.pyc
.venv/
.installed-marker
*.egg-info/
.pytest_cache/

# Node
node_modules/
web/dist/
*.log

# Server-served SPA build
server/static/

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/

# Misc
*.wav
*.mp3
!web/src/**/*.wav
.env
```

- [ ] **Step 4: Create `pytest.ini`**

```ini
[pytest]
testpaths = tests
asyncio_mode = auto
addopts = -ra -q
```

- [ ] **Step 5: Create empty package files**

```bash
mkdir -p server/models tests
touch server/__init__.py server/models/__init__.py tests/__init__.py
```

- [ ] **Step 6: Set up Python venv and install deps**

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Expected: install completes (torch will pull a multi-hundred-MB wheel; that is fine).

- [ ] **Step 7: Verify imports**

```bash
.venv/bin/python -c "import fastapi, pydantic, soundfile, torch, chatterbox; print('ok')"
```

Expected: `ok`. If `import chatterbox` fails, switch the requirements.txt line to `chatterbox-tts @ git+https://github.com/resemble-ai/chatterbox` and reinstall.

- [ ] **Step 8: Commit**

```bash
git add .python-version requirements.txt .gitignore pytest.ini server/__init__.py server/models/__init__.py tests/__init__.py
git commit -m "chore: scaffold python project (requirements, gitignore, pytest, package skeleton)"
```

---

## Task 2: `server/device.py` — auto-detect cuda/mps/cpu

**Files:**
- Create: `server/device.py`
- Test: `tests/test_device.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_device.py`:

```python
import os
from unittest.mock import patch

from server.device import select_device


def test_env_override_cuda():
    with patch.dict(os.environ, {"CHATTERBOX_DEVICE": "cuda"}):
        assert select_device() == "cuda"


def test_env_override_mps():
    with patch.dict(os.environ, {"CHATTERBOX_DEVICE": "MPS"}):
        assert select_device() == "mps"


def test_env_override_cpu():
    with patch.dict(os.environ, {"CHATTERBOX_DEVICE": "cpu"}):
        assert select_device() == "cpu"


def test_invalid_env_falls_through_to_autodetect():
    with patch.dict(os.environ, {"CHATTERBOX_DEVICE": "tpu"}, clear=False):
        with patch("server.device._cuda_available", return_value=True):
            assert select_device() == "cuda"


def test_autodetect_prefers_cuda_over_mps():
    with patch.dict(os.environ, {}, clear=True):
        with patch("server.device._cuda_available", return_value=True), \
             patch("server.device._mps_available", return_value=True):
            assert select_device() == "cuda"


def test_autodetect_uses_mps_when_no_cuda():
    with patch.dict(os.environ, {}, clear=True):
        with patch("server.device._cuda_available", return_value=False), \
             patch("server.device._mps_available", return_value=True):
            assert select_device() == "mps"


def test_autodetect_falls_back_to_cpu():
    with patch.dict(os.environ, {}, clear=True):
        with patch("server.device._cuda_available", return_value=False), \
             patch("server.device._mps_available", return_value=False):
            assert select_device() == "cpu"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_device.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'server.device'`.

- [ ] **Step 3: Write the minimal implementation**

`server/device.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_device.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add server/device.py tests/test_device.py
git commit -m "feat(device): auto-detect cuda/mps/cpu with env override"
```

---

## Task 3: `server/audio.py` — WAV validation, write, normalize

**Files:**
- Create: `server/audio.py`
- Test: `tests/test_audio.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_audio.py`:

```python
import io
import wave

import numpy as np
import pytest

from server.audio import (
    AudioValidationError,
    normalize_to_mono_16k,
    validate_reference_clip,
    write_wav_bytes,
)


def _make_wav_bytes(samples: np.ndarray, sample_rate: int, channels: int = 1) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        pcm = (samples * 32767).clip(-32768, 32767).astype(np.int16)
        if channels > 1:
            pcm = np.repeat(pcm[:, None], channels, axis=1).flatten()
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def test_write_wav_bytes_roundtrip():
    samples = np.sin(np.linspace(0, 6.28, 24000)).astype(np.float32)
    wav_bytes = write_wav_bytes(samples, sample_rate=24000)
    assert wav_bytes[:4] == b"RIFF"
    with wave.open(io.BytesIO(wav_bytes)) as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 24000


def test_validate_accepts_valid_clip():
    samples = np.zeros(48000, dtype=np.float32)  # 2s at 24kHz
    wav = _make_wav_bytes(samples, 24000)
    info = validate_reference_clip(wav)
    assert info.duration_s == pytest.approx(2.0, rel=1e-3)
    assert info.sample_rate == 24000


def test_validate_rejects_too_short():
    samples = np.zeros(2400, dtype=np.float32)  # 0.1s
    wav = _make_wav_bytes(samples, 24000)
    with pytest.raises(AudioValidationError, match="too short"):
        validate_reference_clip(wav)


def test_validate_rejects_too_long():
    samples = np.zeros(24000 * 70, dtype=np.float32)  # 70s
    wav = _make_wav_bytes(samples, 24000)
    with pytest.raises(AudioValidationError, match="too long"):
        validate_reference_clip(wav)


def test_validate_rejects_low_sample_rate():
    samples = np.zeros(8000, dtype=np.float32)  # 1s at 8kHz
    wav = _make_wav_bytes(samples, 8000)
    with pytest.raises(AudioValidationError, match="sample rate"):
        validate_reference_clip(wav)


def test_validate_rejects_non_wav_bytes():
    with pytest.raises(AudioValidationError, match="format"):
        validate_reference_clip(b"not a wav")


def test_normalize_downmixes_stereo_and_resamples():
    samples = np.zeros((48000, 2), dtype=np.float32)  # 1s stereo at 48kHz
    out, sr = normalize_to_mono_16k(samples, original_sr=48000)
    assert out.ndim == 1
    assert sr == 16000
    assert out.shape[0] == 16000
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_audio.py -v
```

Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write the implementation**

`server/audio.py`:

```python
"""Audio I/O and validation utilities."""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import soundfile as sf


MIN_DURATION_S = 0.5
MAX_DURATION_S = 60.0
MIN_SAMPLE_RATE = 16000


class AudioValidationError(ValueError):
    """Raised when a reference clip fails validation."""


@dataclass(frozen=True)
class ClipInfo:
    duration_s: float
    sample_rate: int
    channels: int


def validate_reference_clip(wav_bytes: bytes) -> ClipInfo:
    try:
        with sf.SoundFile(io.BytesIO(wav_bytes)) as f:
            sample_rate = f.samplerate
            channels = f.channels
            frames = f.frames
    except Exception as exc:
        raise AudioValidationError(f"invalid audio format: {exc}") from exc

    duration_s = frames / float(sample_rate) if sample_rate else 0.0

    if sample_rate < MIN_SAMPLE_RATE:
        raise AudioValidationError(
            f"sample rate {sample_rate} below minimum {MIN_SAMPLE_RATE}"
        )
    if duration_s < MIN_DURATION_S:
        raise AudioValidationError(f"clip too short ({duration_s:.2f}s)")
    if duration_s > MAX_DURATION_S:
        raise AudioValidationError(f"clip too long ({duration_s:.2f}s)")

    return ClipInfo(duration_s=duration_s, sample_rate=sample_rate, channels=channels)


def write_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def normalize_to_mono_16k(
    samples: np.ndarray, original_sr: int, target_sr: int = 16000
) -> tuple[np.ndarray, int]:
    """Downmix to mono and naive linear resample to target_sr."""
    if samples.ndim == 2:
        samples = samples.mean(axis=1)
    if original_sr == target_sr:
        return samples.astype(np.float32), target_sr
    duration = samples.shape[0] / float(original_sr)
    target_len = int(round(duration * target_sr))
    x_old = np.linspace(0.0, 1.0, samples.shape[0], endpoint=False)
    x_new = np.linspace(0.0, 1.0, target_len, endpoint=False)
    out = np.interp(x_new, x_old, samples).astype(np.float32)
    return out, target_sr
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_audio.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add server/audio.py tests/test_audio.py
git commit -m "feat(audio): wav validation, write helper, mono/16k normalization"
```

---

## Task 4: `server/schemas.py` — Pydantic request/response models

**Files:**
- Create: `server/schemas.py`
- Test: `tests/test_schemas.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_schemas.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_schemas.py -v
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`server/schemas.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_schemas.py -v
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add server/schemas.py tests/test_schemas.py
git commit -m "feat(schemas): pydantic models for ParamSpec/ModelInfo/Health/Errors"
```

---

## Task 5: `server/zerogpu.py` — `decorate()` shim

**Files:**
- Create: `server/zerogpu.py`
- Test: `tests/test_zerogpu.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_zerogpu.py`:

```python
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

    # re-import to apply patched module
    import importlib
    import server.zerogpu as zg

    importlib.reload(zg)

    @zg.decorate
    def fn(x):
        return x + 1

    assert fn(2) == 3
    fake_spaces.GPU.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_zerogpu.py -v
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`server/zerogpu.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_zerogpu.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/zerogpu.py tests/test_zerogpu.py
git commit -m "feat(zerogpu): decorate() shim for HF ZeroGPU compatibility"
```

---

## Task 6: `server/models/base.py` — `ModelAdapter` interface

**Files:**
- Create: `server/models/base.py`
- Test: `tests/test_models_base.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_models_base.py`:

```python
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
    # default outside bounds
    with pytest.raises(ValueError):
        ParamSpec(name="t", label="T", type="float", default=2.0, min=0.0, max=1.0)


def test_lang_dataclass():
    l = Lang(code="hi", label="Hindi")
    assert (l.code, l.label) == ("hi", "Hindi")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_models_base.py -v
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

`server/models/base.py`:

```python
"""ModelAdapter interface and supporting types.

Re-exports `Lang` and `ParamSpec` from `server.schemas` so that
adapter modules and the API layer share a single source of truth.
"""
from __future__ import annotations

from typing import Any, ClassVar, Protocol, runtime_checkable

from server.schemas import Lang, ParamSpec


@runtime_checkable
class ModelAdapter(Protocol):
    id: ClassVar[str]
    label: ClassVar[str]
    description: ClassVar[str]
    languages: ClassVar[list[Lang]]
    paralinguistic_tags: ClassVar[list[str]]
    supports_voice_clone: ClassVar[bool]
    params: ClassVar[list[ParamSpec]]

    def __init__(self, device: str) -> None: ...
    def load(self) -> None: ...
    def unload(self) -> None: ...
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int]: ...


def is_valid_adapter(cls: type) -> bool:
    """Quick declarative-fields check (does not require instantiation)."""
    required = (
        "id",
        "label",
        "description",
        "languages",
        "paralinguistic_tags",
        "supports_voice_clone",
        "params",
    )
    if not all(hasattr(cls, n) for n in required):
        return False
    if not getattr(cls, "id", "").strip():
        return False
    if not isinstance(getattr(cls, "languages"), list):
        return False
    if not isinstance(getattr(cls, "params"), list):
        return False
    return True
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_models_base.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add server/models/__init__.py server/models/base.py tests/test_models_base.py
git commit -m "feat(models): ModelAdapter protocol + is_valid_adapter check"
```

---

## Task 7: `server/registry.py` — active-model registry with swap lock and SSE events

**Files:**
- Create: `server/registry.py`, `tests/conftest.py`
- Test: `tests/test_registry.py`

- [ ] **Step 1: Create `tests/conftest.py` with a `FakeAdapter`**

`tests/conftest.py`:

```python
"""Shared test fixtures."""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from server.models.base import ModelAdapter
from server.schemas import Lang, ParamSpec


class FakeAdapter:
    """Minimal in-memory adapter for unit tests."""
    id = "fake"
    label = "Fake"
    description = "Test fake"
    languages = [Lang(code="en", label="English")]
    paralinguistic_tags: list[str] = ["[laugh]"]
    supports_voice_clone = True
    params = [ParamSpec(name="t", label="T", type="float", default=0.5, min=0.0, max=1.0)]

    instances: list["FakeAdapter"] = []

    def __init__(self, device: str):
        self.device = device
        self.loaded = False
        self.unload_called = False
        self.load_should_fail = False
        FakeAdapter.instances.append(self)

    def load(self) -> None:
        if self.load_should_fail:
            raise RuntimeError("simulated load failure")
        self.loaded = True

    def unload(self) -> None:
        self.unload_called = True
        self.loaded = False

    def generate(self, text, reference_wav_path, language, params):
        return (b"FAKEWAV", 24000)


class FakeAdapterB(FakeAdapter):
    id = "fake-b"
    label = "Fake B"


@pytest.fixture
def fake_classes():
    FakeAdapter.instances.clear()
    return {FakeAdapter.id: FakeAdapter, FakeAdapterB.id: FakeAdapterB}


@pytest.fixture
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
```

- [ ] **Step 2: Write the failing tests**

`tests/test_registry.py`:

```python
import asyncio

import pytest

from server.registry import Registry


pytestmark = pytest.mark.asyncio


async def test_get_or_load_loads_first_time(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    a = await reg.get_or_load("fake")
    assert a.loaded is True
    assert reg.status()["status"] == "loaded"
    assert reg.status()["id"] == "fake"


async def test_get_or_load_reuses_active(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    a1 = await reg.get_or_load("fake")
    a2 = await reg.get_or_load("fake")
    assert a1 is a2


async def test_get_or_load_swaps_to_different(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    a = await reg.get_or_load("fake")
    b = await reg.get_or_load("fake-b")
    assert b.loaded is True
    assert a.unload_called is True
    assert reg.status()["id"] == "fake-b"


async def test_get_or_load_unknown_id_raises(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    with pytest.raises(KeyError):
        await reg.get_or_load("nope")


async def test_load_failure_sets_error_status(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    fake_classes["fake"].instances.clear()
    # Patch the next instance to fail
    orig_init = fake_classes["fake"].__init__
    def patched_init(self, device):
        orig_init(self, device)
        self.load_should_fail = True
    fake_classes["fake"].__init__ = patched_init
    try:
        with pytest.raises(RuntimeError):
            await reg.get_or_load("fake")
        s = reg.status()
        assert s["status"] == "error"
        assert "simulated" in s["last_error"]
    finally:
        fake_classes["fake"].__init__ = orig_init


async def test_concurrent_activations_serialize(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    results = await asyncio.gather(
        reg.get_or_load("fake"),
        reg.get_or_load("fake-b"),
        reg.get_or_load("fake"),
    )
    assert all(r.loaded for r in results)


async def test_emits_loading_then_loaded_events(fake_classes):
    reg = Registry(adapter_classes=fake_classes, device="cpu")
    seen: list[dict] = []

    async def collect():
        async for evt in reg.stream_events():
            seen.append(evt)
            if evt["status"] == "loaded":
                return

    consumer = asyncio.create_task(collect())
    await asyncio.sleep(0)  # let consumer subscribe
    await reg.get_or_load("fake")
    await asyncio.wait_for(consumer, timeout=2)
    statuses = [e["status"] for e in seen]
    assert "loading" in statuses
    assert "loaded" in statuses
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_registry.py -v
```

Expected: FAIL — `server.registry` missing.

- [ ] **Step 4: Write the implementation**

`server/registry.py`:

```python
"""Active-model registry with async swap lock and SSE event bus."""
from __future__ import annotations

import asyncio
import gc
from typing import Any, AsyncIterator

import torch

from server.models.base import ModelAdapter


class Registry:
    def __init__(self, adapter_classes: dict[str, type], device: str):
        self._classes = adapter_classes
        self._device = device
        self._active: ModelAdapter | None = None
        self._active_id: str | None = None
        self._status: str = "idle"
        self._last_error: str | None = None
        self._lock = asyncio.Lock()
        self._subscribers: list[asyncio.Queue[dict]] = []

    @property
    def device(self) -> str:
        return self._device

    def status(self) -> dict:
        return {"id": self._active_id, "status": self._status, "last_error": self._last_error}

    def list_models(self) -> list[dict]:
        return [
            {
                "id": cls.id,
                "label": cls.label,
                "description": cls.description,
                "languages": [l.model_dump() for l in cls.languages],
                "paralinguistic_tags": cls.paralinguistic_tags,
                "supports_voice_clone": cls.supports_voice_clone,
                "params": [p.model_dump() for p in cls.params],
            }
            for cls in self._classes.values()
        ]

    async def get_or_load(self, model_id: str) -> ModelAdapter:
        if model_id not in self._classes:
            raise KeyError(model_id)
        async with self._lock:
            if self._active_id == model_id and self._active is not None:
                return self._active
            await self._publish({"id": model_id, "status": "loading"})
            self._status = "loading"
            self._last_error = None
            if self._active is not None:
                try:
                    self._active.unload()
                finally:
                    self._active = None
                    self._free_caches()
            try:
                instance = self._classes[model_id](self._device)
                instance.load()
            except Exception as exc:
                self._status = "error"
                self._last_error = str(exc)
                self._active_id = None
                await self._publish({"id": model_id, "status": "error", "error": str(exc)})
                raise
            self._active = instance
            self._active_id = model_id
            self._status = "loaded"
            await self._publish({"id": model_id, "status": "loaded"})
            return instance

    async def stream_events(self) -> AsyncIterator[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue()
        self._subscribers.append(q)
        try:
            # immediate snapshot for late subscribers
            await q.put({"id": self._active_id, "status": self._status})
            while True:
                yield await q.get()
        finally:
            self._subscribers.remove(q)

    async def _publish(self, event: dict) -> None:
        for q in list(self._subscribers):
            await q.put(event)

    def _free_caches(self) -> None:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        mps = getattr(torch.backends, "mps", None)
        if mps and mps.is_available():
            try:
                torch.mps.empty_cache()  # type: ignore[attr-defined]
            except Exception:
                pass
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_registry.py -v
```

Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add server/registry.py tests/conftest.py tests/test_registry.py
git commit -m "feat(registry): active-model swap with async lock and SSE event bus"
```

---

## Task 8: FastAPI app — lifespan, CORS, `/api/health`

**Files:**
- Create: `server/main.py`
- Test: `tests/test_main_health.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_main_health.py`:

```python
from fastapi.testclient import TestClient

from server.main import build_app


def test_health_returns_device_and_status(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    with TestClient(app) as client:
        r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["device"] == "cpu"
    assert data["model_status"] == "idle"
    assert "torch_version" in data
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_main_health.py -v
```

Expected: FAIL — `server.main` missing.

- [ ] **Step 3: Write the implementation**

`server/main.py`:

```python
"""FastAPI application factory."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.device import select_device
from server.registry import Registry


STATIC_DIR = Path(__file__).parent / "static"


def _discover_adapter_classes() -> dict[str, type]:
    """Lazily import adapter modules. Empty dict during early scaffolding."""
    classes: dict[str, type] = {}
    for module_name in ("chatterbox_en", "chatterbox_turbo", "chatterbox_mtl"):
        try:
            mod = __import__(f"server.models.{module_name}", fromlist=["Adapter"])
        except ImportError:
            continue
        cls = getattr(mod, "Adapter", None)
        if cls is not None:
            classes[cls.id] = cls
    return classes


def build_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        device = select_device()
        app.state.registry = Registry(
            adapter_classes=_discover_adapter_classes(),
            device=device,
        )
        yield

    app = FastAPI(title="Chatterbox Voice Studio", lifespan=lifespan)

    origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        registry = app.state.registry
        return {
            "device": registry.device,
            "torch_version": torch.__version__,
            "model_status": registry.status()["status"],
        }

    if STATIC_DIR.exists():
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    return app


app = build_app()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_main_health.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add server/main.py tests/test_main_health.py
git commit -m "feat(api): FastAPI app factory with lifespan, CORS, /api/health"
```

---

## Task 9: `/api/models` and `/api/models/active` endpoints

**Files:**
- Modify: `server/main.py`
- Test: `tests/test_main_models.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_main_models.py`:

```python
from fastapi.testclient import TestClient

from server.main import build_app


def test_models_list_returns_registered(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    with TestClient(app) as client:
        r = client.get("/api/models")
    assert r.status_code == 200
    items = r.json()
    ids = sorted(m["id"] for m in items)
    assert ids == ["fake", "fake-b"]
    fake = next(m for m in items if m["id"] == "fake")
    assert fake["paralinguistic_tags"] == ["[laugh]"]
    assert fake["params"][0]["name"] == "t"


def test_active_model_initially_idle(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    with TestClient(app) as client:
        r = client.get("/api/models/active")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] is None
    assert body["status"] == "idle"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_main_models.py -v
```

Expected: 404 on `/api/models`.

- [ ] **Step 3: Add the endpoints to `server/main.py`**

Insert after the `health()` route inside `build_app()`:

```python
    @app.get("/api/models")
    def list_models() -> list[dict]:
        return app.state.registry.list_models()

    @app.get("/api/models/active")
    def active_model() -> dict:
        return app.state.registry.status()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_main_models.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/main.py tests/test_main_models.py
git commit -m "feat(api): /api/models list and /api/models/active status"
```

---

## Task 10: Activate model + SSE event stream

**Files:**
- Modify: `server/main.py`
- Test: `tests/test_main_activate.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_main_activate.py`:

```python
import asyncio

import httpx
import pytest

from server.main import build_app


pytestmark = pytest.mark.asyncio


async def test_activate_then_status_loaded(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        # lifespan
        await c.get("/api/health")
        r = await c.post("/api/models/fake/activate")
        assert r.status_code in (200, 202)
        # poll status (lock released by then)
        for _ in range(20):
            s = (await c.get("/api/models/active")).json()
            if s["status"] == "loaded":
                break
            await asyncio.sleep(0.05)
        assert s["id"] == "fake"
        assert s["status"] == "loaded"


async def test_activate_unknown_returns_404(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        await c.get("/api/health")
        r = await c.post("/api/models/nope/activate")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"


async def test_active_events_stream_emits_loaded(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        await c.get("/api/health")
        async with c.stream("GET", "/api/models/active/events") as stream:
            # activate from a separate task
            asyncio.create_task(c.post("/api/models/fake/activate"))
            seen_loaded = False
            async for line in stream.aiter_lines():
                if line.startswith("data:") and "loaded" in line:
                    seen_loaded = True
                    break
        assert seen_loaded
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_main_activate.py -v
```

Expected: 404s — endpoints not yet defined.

- [ ] **Step 3: Add the endpoints to `server/main.py`**

Add at the top of `server/main.py`:

```python
import json

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
```

Insert these inside `build_app()` after `active_model`:

```python
    @app.post("/api/models/{model_id}/activate")
    async def activate_model(model_id: str):
        try:
            await app.state.registry.get_or_load(model_id)
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "model_not_found", "message": model_id}},
            )
        except Exception as exc:
            return JSONResponse(
                status_code=503,
                content={"error": {"code": "model_load_failed", "message": str(exc)}},
            )
        return {"ok": True}

    @app.get("/api/models/active/events")
    async def active_events():
        async def gen():
            async for evt in app.state.registry.stream_events():
                yield {"data": json.dumps(evt)}
        return EventSourceResponse(gen())
```

Also add a global exception handler at the end of `build_app()` (just before `return app`) so the schema is consistent:

```python
    @app.exception_handler(HTTPException)
    async def _http_exc(request, exc: HTTPException):  # type: ignore[unused-ignore]
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "http_error", "message": str(exc.detail)}},
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_main_activate.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add server/main.py tests/test_main_activate.py
git commit -m "feat(api): activate-model endpoint and SSE event stream"
```

---

## Task 11: `/api/generate` endpoint + first adapter (`chatterbox-en`)

**Files:**
- Create: `server/models/chatterbox_en.py`
- Modify: `server/main.py`
- Test: `tests/test_main_generate.py`, `tests/test_adapter_contract.py`

- [ ] **Step 1: Write the failing tests for the API behavior**

`tests/test_main_generate.py`:

```python
import asyncio

import httpx
import pytest

from server.main import build_app


pytestmark = pytest.mark.asyncio


async def test_generate_returns_wav_bytes(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        await c.get("/api/health")
        r = await c.post(
            "/api/generate",
            data={
                "text": "hello world",
                "model_id": "fake",
                "params": "{}",
            },
        )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/wav")
    assert r.content == b"FAKEWAV"


async def test_generate_unknown_model_404(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        await c.get("/api/health")
        r = await c.post(
            "/api/generate",
            data={"text": "x", "model_id": "nope", "params": "{}"},
        )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"


async def test_generate_invalid_reference_returns_400(monkeypatch, fake_classes, tmp_path):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    transport = httpx.ASGITransport(app=app)
    bad = b"not a wav"
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        await c.get("/api/health")
        r = await c.post(
            "/api/generate",
            data={"text": "x", "model_id": "fake", "params": "{}"},
            files={"reference_wav": ("ref.wav", bad, "audio/wav")},
        )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "reference_invalid"
```

- [ ] **Step 2: Add the `/api/generate` endpoint**

At the top of `server/main.py` add:

```python
import tempfile

from fastapi import File, Form, UploadFile
from fastapi.responses import Response

from server.audio import AudioValidationError, validate_reference_clip
from server.zerogpu import decorate
```

Insert inside `build_app()` (after the SSE endpoint):

```python
    @app.post("/api/generate")
    async def generate(
        text: str = Form(...),
        model_id: str = Form(...),
        params: str = Form("{}"),
        language: str | None = Form(None),
        reference_wav: UploadFile | None = File(None),
    ):
        try:
            adapter = await app.state.registry.get_or_load(model_id)
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "model_not_found", "message": model_id}},
            )
        ref_path = None
        if reference_wav is not None:
            data = await reference_wav.read()
            try:
                validate_reference_clip(data)
            except AudioValidationError as exc:
                return JSONResponse(
                    status_code=400,
                    content={"error": {"code": "reference_invalid", "message": str(exc)}},
                )
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            tmp.write(data)
            tmp.flush()
            tmp.close()
            ref_path = tmp.name

        gen = decorate(adapter.generate)
        try:
            wav_bytes, _sr = gen(text, ref_path, language, json.loads(params or "{}"))
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "generation_failed", "message": str(exc)}},
            )
        return Response(content=wav_bytes, media_type="audio/wav")
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_main_generate.py -v
```

Expected: 3 passed.

- [ ] **Step 4: Implement the first real adapter — `chatterbox-en`**

`server/models/chatterbox_en.py`:

```python
"""Chatterbox English adapter (ResembleAI/chatterbox)."""
from __future__ import annotations

import io
from typing import Any, ClassVar

import soundfile as sf

from server.schemas import Lang, ParamSpec


class Adapter:
    id: ClassVar[str] = "chatterbox-en"
    label: ClassVar[str] = "Chatterbox (English)"
    description: ClassVar[str] = (
        "Original Chatterbox English voice cloning with CFG and exaggeration controls."
    )
    languages: ClassVar[list[Lang]] = [Lang(code="en", label="English")]
    paralinguistic_tags: ClassVar[list[str]] = []
    supports_voice_clone: ClassVar[bool] = True
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(
            name="exaggeration", label="Exaggeration", type="float",
            default=0.5, min=0.0, max=2.0, step=0.05,
            help="Higher = more expressive prosody.",
        ),
        ParamSpec(
            name="cfg_weight", label="CFG weight", type="float",
            default=0.5, min=0.0, max=1.0, step=0.05,
        ),
        ParamSpec(
            name="temperature", label="Temperature", type="float",
            default=0.8, min=0.1, max=1.5, step=0.05,
        ),
    ]

    def __init__(self, device: str) -> None:
        self.device = device
        self._model = None

    def load(self) -> None:
        from chatterbox.tts import ChatterboxTTS  # heavy import

        self._model = ChatterboxTTS.from_pretrained(device=self.device)

    def unload(self) -> None:
        self._model = None

    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        wav = self._model.generate(
            text,
            audio_prompt_path=reference_wav_path,
            exaggeration=float(params.get("exaggeration", 0.5)),
            cfg_weight=float(params.get("cfg_weight", 0.5)),
            temperature=float(params.get("temperature", 0.8)),
        )
        # ChatterboxTTS returns a torch tensor (1, T) — convert to int16 wav bytes.
        import numpy as np
        import torch

        if hasattr(wav, "detach"):
            wav = wav.detach().cpu().numpy()
        if isinstance(wav, torch.Tensor):  # pragma: no cover
            wav = wav.numpy()
        arr = np.asarray(wav).squeeze()
        sr = getattr(self._model, "sr", 24000)
        buf = io.BytesIO()
        sf.write(buf, arr, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue(), sr
```

- [ ] **Step 5: Add adapter contract test**

`tests/test_adapter_contract.py`:

```python
import importlib

import pytest

from server.models.base import is_valid_adapter
from server.schemas import ParamSpec


ADAPTER_MODULES = [
    "server.models.chatterbox_en",
]


@pytest.mark.parametrize("module_name", ADAPTER_MODULES)
def test_adapter_class_attributes_valid(module_name):
    mod = importlib.import_module(module_name)
    cls = getattr(mod, "Adapter")
    assert is_valid_adapter(cls)
    assert cls.id
    for p in cls.params:
        assert isinstance(p, ParamSpec)
```

Run:

```bash
.venv/bin/pytest tests/test_adapter_contract.py -v
```

Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add server/main.py server/models/chatterbox_en.py tests/test_main_generate.py tests/test_adapter_contract.py
git commit -m "feat(api,models): /api/generate endpoint + chatterbox-en adapter"
```

---

## Task 12: `chatterbox-turbo` adapter

**Files:**
- Create: `server/models/chatterbox_turbo.py`
- Modify: `tests/test_adapter_contract.py`

- [ ] **Step 1: Write the adapter**

`server/models/chatterbox_turbo.py`:

```python
"""Chatterbox Turbo adapter — fast English with paralinguistic tags."""
from __future__ import annotations

import io
from typing import Any, ClassVar

import soundfile as sf

from server.schemas import Lang, ParamSpec


class Adapter:
    id: ClassVar[str] = "chatterbox-turbo"
    label: ClassVar[str] = "Chatterbox Turbo"
    description: ClassVar[str] = (
        "Faster, lower-VRAM English variant. Supports [laugh], [cough], [chuckle] tags."
    )
    languages: ClassVar[list[Lang]] = [Lang(code="en", label="English")]
    paralinguistic_tags: ClassVar[list[str]] = ["[laugh]", "[cough]", "[chuckle]"]
    supports_voice_clone: ClassVar[bool] = True
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(name="cfg_weight", label="CFG weight", type="float",
                  default=0.5, min=0.0, max=1.0, step=0.05),
        ParamSpec(name="temperature", label="Temperature", type="float",
                  default=0.8, min=0.1, max=1.5, step=0.05),
    ]

    def __init__(self, device: str) -> None:
        self.device = device
        self._model = None

    def load(self) -> None:
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        self._model = ChatterboxTurboTTS.from_pretrained(device=self.device)

    def unload(self) -> None:
        self._model = None

    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        wav = self._model.generate(
            text,
            audio_prompt_path=reference_wav_path,
            cfg_weight=float(params.get("cfg_weight", 0.5)),
            temperature=float(params.get("temperature", 0.8)),
        )
        import numpy as np
        import torch

        if hasattr(wav, "detach"):
            wav = wav.detach().cpu().numpy()
        if isinstance(wav, torch.Tensor):  # pragma: no cover
            wav = wav.numpy()
        arr = np.asarray(wav).squeeze()
        sr = getattr(self._model, "sr", 24000)
        buf = io.BytesIO()
        sf.write(buf, arr, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue(), sr
```

- [ ] **Step 2: Extend the contract test list**

In `tests/test_adapter_contract.py` change `ADAPTER_MODULES` to:

```python
ADAPTER_MODULES = [
    "server.models.chatterbox_en",
    "server.models.chatterbox_turbo",
]
```

- [ ] **Step 3: Run the contract test**

```bash
.venv/bin/pytest tests/test_adapter_contract.py -v
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add server/models/chatterbox_turbo.py tests/test_adapter_contract.py
git commit -m "feat(models): chatterbox-turbo adapter with paralinguistic tags"
```

---

## Task 13: `chatterbox-mtl` adapter (multilingual)

**Files:**
- Create: `server/models/chatterbox_mtl.py`
- Modify: `tests/test_adapter_contract.py`

- [ ] **Step 1: Write the adapter**

`server/models/chatterbox_mtl.py`:

```python
"""Chatterbox Multilingual adapter (23 languages)."""
from __future__ import annotations

import io
from typing import Any, ClassVar

import soundfile as sf

from server.schemas import Lang, ParamSpec


_MTL_LANGS: list[Lang] = [
    Lang(code="ar", label="Arabic"),
    Lang(code="da", label="Danish"),
    Lang(code="de", label="German"),
    Lang(code="el", label="Greek"),
    Lang(code="en", label="English"),
    Lang(code="es", label="Spanish"),
    Lang(code="fi", label="Finnish"),
    Lang(code="fr", label="French"),
    Lang(code="he", label="Hebrew"),
    Lang(code="hi", label="Hindi"),
    Lang(code="it", label="Italian"),
    Lang(code="ja", label="Japanese"),
    Lang(code="ko", label="Korean"),
    Lang(code="ms", label="Malay"),
    Lang(code="nl", label="Dutch"),
    Lang(code="no", label="Norwegian"),
    Lang(code="pl", label="Polish"),
    Lang(code="pt", label="Portuguese"),
    Lang(code="ru", label="Russian"),
    Lang(code="sv", label="Swedish"),
    Lang(code="sw", label="Swahili"),
    Lang(code="tr", label="Turkish"),
    Lang(code="zh", label="Chinese"),
]


class Adapter:
    id: ClassVar[str] = "chatterbox-mtl"
    label: ClassVar[str] = "Chatterbox Multilingual"
    description: ClassVar[str] = (
        "23-language voice cloning. Pick a language at generate time."
    )
    languages: ClassVar[list[Lang]] = _MTL_LANGS
    paralinguistic_tags: ClassVar[list[str]] = []  # TBD on first manual run
    supports_voice_clone: ClassVar[bool] = True
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(name="exaggeration", label="Exaggeration", type="float",
                  default=0.5, min=0.0, max=2.0, step=0.05),
        ParamSpec(name="cfg_weight", label="CFG weight", type="float",
                  default=0.5, min=0.0, max=1.0, step=0.05),
    ]

    def __init__(self, device: str) -> None:
        self.device = device
        self._model = None

    def load(self) -> None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        self._model = ChatterboxMultilingualTTS.from_pretrained(device=self.device)

    def unload(self) -> None:
        self._model = None

    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        if not language:
            raise ValueError("language is required for chatterbox-mtl")
        wav = self._model.generate(
            text,
            language_id=language,
            audio_prompt_path=reference_wav_path,
            exaggeration=float(params.get("exaggeration", 0.5)),
            cfg_weight=float(params.get("cfg_weight", 0.5)),
        )
        import numpy as np
        import torch

        if hasattr(wav, "detach"):
            wav = wav.detach().cpu().numpy()
        if isinstance(wav, torch.Tensor):  # pragma: no cover
            wav = wav.numpy()
        arr = np.asarray(wav).squeeze()
        sr = getattr(self._model, "sr", 24000)
        buf = io.BytesIO()
        sf.write(buf, arr, sr, format="WAV", subtype="PCM_16")
        return buf.getvalue(), sr
```

- [ ] **Step 2: Extend the contract test list**

In `tests/test_adapter_contract.py`:

```python
ADAPTER_MODULES = [
    "server.models.chatterbox_en",
    "server.models.chatterbox_turbo",
    "server.models.chatterbox_mtl",
]
```

- [ ] **Step 3: Run the contract test**

```bash
.venv/bin/pytest tests/test_adapter_contract.py -v
```

Expected: 3 passed.

- [ ] **Step 4: Run the full test suite**

```bash
.venv/bin/pytest -v
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/models/chatterbox_mtl.py tests/test_adapter_contract.py
git commit -m "feat(models): chatterbox-mtl multilingual adapter (23 langs)"
```

---

## Task 14: `scripts/smoke.sh`

**Files:**
- Create: `scripts/smoke.sh`

- [ ] **Step 1: Write the smoke script**

`scripts/smoke.sh`:

```bash
#!/usr/bin/env bash
# Smoke test against a running server on http://127.0.0.1:7860.
# Usage: scripts/smoke.sh [BASE_URL]
set -euo pipefail

BASE="${1:-http://127.0.0.1:7860}"

echo "== /api/health"
curl -fsS "$BASE/api/health" | tee /dev/stderr | grep -q '"device"'

echo
echo "== /api/models"
curl -fsS "$BASE/api/models" | tee /dev/stderr | grep -q 'chatterbox-en'

echo
echo "== activate chatterbox-en"
curl -fsS -X POST "$BASE/api/models/chatterbox-en/activate"

echo
echo "== generate (1 sentence)"
TMP=$(mktemp -t smoke.XXXXXX.wav)
curl -fsS -X POST "$BASE/api/generate" \
    -F text='Hello world from Chatterbox.' \
    -F model_id=chatterbox-en \
    -F params='{}' \
    -o "$TMP"
HEAD=$(head -c 4 "$TMP" | xxd -p)
if [ "$HEAD" != "52494646" ]; then
    echo "FAIL: output is not a RIFF wav (head=$HEAD)"
    exit 1
fi
echo "OK — wrote $TMP ($(wc -c <"$TMP") bytes)"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/smoke.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.sh
git commit -m "chore(scripts): add smoke.sh end-to-end check"
```

---

## Task 15: Frontend scaffold — Vite + React + TS + Tailwind + shadcn

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/tailwind.config.ts`, `web/postcss.config.cjs`, `web/components.json`, `web/index.html`

- [ ] **Step 1: Initialize Vite project**

```bash
cd web   # creates from inside parent
```

If `web/` directory does not exist yet, create it:

```bash
mkdir -p web
cd web
```

Create `package.json`:

```json
{
  "name": "chatterbox-voice-studio-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slider": "^1.2.1",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-tooltip": "^1.1.4",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "dexie": "^4.0.10",
    "lucide-react": "^0.456.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.4",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7860",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 5: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

- [ ] **Step 6: Create `postcss.config.cjs`**

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `components.json` (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 8: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chatterbox Voice Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Install dependencies**

```bash
cd web
npm install
```

Expected: install completes; `node_modules/` populated.

- [ ] **Step 10: Commit (web is now ready for source files)**

```bash
cd ..
git add web/package.json web/package-lock.json web/tsconfig.json web/tsconfig.node.json web/vite.config.ts web/tailwind.config.ts web/postcss.config.cjs web/components.json web/index.html
git commit -m "chore(web): scaffold Vite + React + TS + Tailwind + shadcn config"
```

---

## Task 16: Frontend shell — entrypoint, theme tokens, App, Studio skeleton

**Files:**
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles/index.css`, `web/src/lib/utils.ts`, `web/src/lib/theme.ts`, `web/src/pages/Studio.tsx`, `web/src/test/setup.ts`

- [ ] **Step 1: Create `src/styles/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --ring: 240 5% 64.9%;
    --primary: 250 76% 62%;
    --primary-foreground: 0 0% 100%;
    --accent: 268 92% 70%;
    --accent-foreground: 0 0% 100%;
    --radius: 0.75rem;
  }
  .dark {
    --background: 240 10% 4%;
    --foreground: 0 0% 98%;
    --muted: 240 4% 12%;
    --muted-foreground: 240 5% 65%;
    --border: 240 6% 18%;
    --ring: 250 76% 62%;
    --primary: 250 76% 62%;
    --primary-foreground: 0 0% 100%;
    --accent: 268 92% 70%;
    --accent-foreground: 0 0% 100%;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

- [ ] **Step 2: Create `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create `src/lib/theme.ts`**

```ts
const KEY = "chatterbox.theme";

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function applyInitialTheme() {
  setTheme(getTheme());
}
```

- [ ] **Step 4: Create `src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import App from "./App";
import { applyInitialTheme } from "./lib/theme";

applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 5: Create `src/App.tsx`**

```tsx
import Studio from "./pages/Studio";

export default function App() {
  return <Studio />;
}
```

- [ ] **Step 6: Create `src/pages/Studio.tsx` (shell only)**

```tsx
export default function Studio() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="font-medium">Chatterbox Voice Studio</span>
        </div>
        <div className="text-sm text-muted-foreground">stub</div>
      </header>
      <main className="flex-1 grid lg:grid-cols-[1fr_420px] gap-6 p-6">
        <section className="space-y-4">Composer goes here</section>
        <aside className="space-y-4">Workspace goes here</aside>
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

- [ ] **Step 8: Verify the dev server runs and test runner works**

```bash
cd web
npm run build
```

Expected: `vite build` succeeds; `dist/` is created.

```bash
npm run test
```

Expected: vitest runs (no tests yet — exits 0 with message about no tests).

- [ ] **Step 9: Commit**

```bash
cd ..
git add web/src/main.tsx web/src/App.tsx web/src/pages/Studio.tsx web/src/styles/index.css web/src/lib/utils.ts web/src/lib/theme.ts web/src/test/setup.ts
git commit -m "feat(web): app shell, theme tokens, Studio skeleton"
```

---

## Task 17: `lib/api.ts` — typed fetch wrappers

**Files:**
- Create: `web/src/lib/api.ts`, `web/src/test/api.test.ts`

- [ ] **Step 1: Write the failing tests**

`web/src/test/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateModel, generate, getActiveModel, listModels } from "@/lib/api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("api", () => {
  it("listModels GETs /api/models", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: "x" }])));
    const out = await listModels();
    expect(fetchMock).toHaveBeenCalledWith("/api/models");
    expect(out[0].id).toBe("x");
  });

  it("getActiveModel returns status object", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "x", status: "loaded" })),
    );
    const out = await getActiveModel();
    expect(out.status).toBe("loaded");
  });

  it("activateModel posts to /api/models/{id}/activate", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 202 }));
    await activateModel("foo");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/models/foo/activate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("generate posts multipart and returns blob", async () => {
    const wav = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    fetchMock.mockResolvedValue(new Response(wav, { status: 200 }));
    const out = await generate({
      modelId: "x",
      text: "hi",
      params: {},
    });
    expect(out.size).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("generate surfaces error JSON on 4xx", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "model_not_found", message: "x" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      generate({ modelId: "x", text: "hi", params: {} }),
    ).rejects.toThrow(/model_not_found/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npm run test -- api.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/api.ts`**

`web/src/lib/api.ts`:

```ts
export type Lang = { code: string; label: string };

export type ParamSpec = {
  name: string;
  label: string;
  type: "float" | "int" | "bool" | "enum";
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
  help?: string;
};

export type ModelInfo = {
  id: string;
  label: string;
  description: string;
  languages: Lang[];
  paralinguistic_tags: string[];
  supports_voice_clone: boolean;
  params: ParamSpec[];
};

export type ActiveStatus = {
  id: string | null;
  status: "idle" | "loading" | "loaded" | "error";
  last_error: string | null;
};

export async function listModels(): Promise<ModelInfo[]> {
  const r = await fetch("/api/models");
  if (!r.ok) throw new Error(`listModels: ${r.status}`);
  return r.json();
}

export async function getActiveModel(): Promise<ActiveStatus> {
  const r = await fetch("/api/models/active");
  if (!r.ok) throw new Error(`getActiveModel: ${r.status}`);
  return r.json();
}

export async function activateModel(id: string): Promise<void> {
  const r = await fetch(`/api/models/${encodeURIComponent(id)}/activate`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.code ?? `activateModel: ${r.status}`);
  }
}

export type GenerateInput = {
  modelId: string;
  text: string;
  language?: string;
  params: Record<string, unknown>;
  reference?: Blob;
};

export async function generate(input: GenerateInput): Promise<Blob> {
  const fd = new FormData();
  fd.set("text", input.text);
  fd.set("model_id", input.modelId);
  fd.set("params", JSON.stringify(input.params ?? {}));
  if (input.language) fd.set("language", input.language);
  if (input.reference) fd.set("reference_wav", input.reference, "ref.wav");
  const r = await fetch("/api/generate", { method: "POST", body: fd });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.code ?? `generate: ${r.status}`);
  }
  return r.blob();
}

export function streamActiveEvents(onEvent: (e: { id: string | null; status: string; error?: string }) => void) {
  const es = new EventSource("/api/models/active/events");
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data));
    } catch {
      /* ignore malformed */
    }
  };
  return () => es.close();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npm run test -- api.test
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/lib/api.ts web/src/test/api.test.ts
git commit -m "feat(web): typed API client (listModels, generate, SSE stream)"
```

---

## Task 18: `lib/idb.ts` — Dexie schema + CRUD

**Files:**
- Create: `web/src/lib/idb.ts`, `web/src/test/idb.test.ts`

- [ ] **Step 1: Write the failing tests**

`web/src/test/idb.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  addHistory,
  addVoice,
  db,
  deleteVoice,
  listHistory,
  listVoices,
  setFavorite,
  HISTORY_CAP,
} from "@/lib/idb";

beforeEach(async () => {
  await db.voices.clear();
  await db.history.clear();
});

describe("voices", () => {
  it("adds and lists voices ordered by createdAt desc", async () => {
    await addVoice({ name: "A", blob: new Blob(["a"]), sampleRate: 24000, durationMs: 1000 });
    await addVoice({ name: "B", blob: new Blob(["b"]), sampleRate: 24000, durationMs: 1500 });
    const out = await listVoices();
    expect(out.map((v) => v.name)).toEqual(["B", "A"]);
  });

  it("setFavorite toggles", async () => {
    const id = await addVoice({ name: "A", blob: new Blob(["a"]), sampleRate: 24000, durationMs: 1000 });
    await setFavorite(id, true);
    const v = (await listVoices()).find((x) => x.id === id)!;
    expect(v.isFavorite).toBe(true);
  });

  it("deleteVoice removes", async () => {
    const id = await addVoice({ name: "A", blob: new Blob(["a"]), sampleRate: 24000, durationMs: 1000 });
    await deleteVoice(id);
    expect(await listVoices()).toEqual([]);
  });
});

describe("history", () => {
  it("caps at HISTORY_CAP entries (oldest evicted)", async () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      await addHistory({
        text: `t${i}`,
        modelId: "x",
        voiceId: undefined,
        language: undefined,
        params: {},
        audioBlob: new Blob([`${i}`]),
      });
    }
    const items = await listHistory();
    expect(items.length).toBe(HISTORY_CAP);
    expect(items[0].text).toBe(`t${HISTORY_CAP + 4}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npm run test -- idb.test
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/idb.ts`**

`web/src/lib/idb.ts`:

```ts
import Dexie, { type Table } from "dexie";

export const HISTORY_CAP = 50;

export type VoiceRecord = {
  id?: number;
  name: string;
  blob: Blob;
  sampleRate: number;
  durationMs: number;
  createdAt: number;
  isFavorite: boolean;
};

export type HistoryRecord = {
  id?: number;
  text: string;
  modelId: string;
  voiceId?: number;
  language?: string;
  params: Record<string, unknown>;
  audioBlob: Blob;
  createdAt: number;
};

class DB extends Dexie {
  voices!: Table<VoiceRecord, number>;
  history!: Table<HistoryRecord, number>;

  constructor() {
    super("chatterbox-voice-studio");
    this.version(1).stores({
      voices: "++id, name, createdAt, isFavorite",
      history: "++id, createdAt",
    });
  }
}

export const db = new DB();

export async function addVoice(
  v: Omit<VoiceRecord, "id" | "createdAt" | "isFavorite"> & Partial<Pick<VoiceRecord, "isFavorite">>,
): Promise<number> {
  return db.voices.add({
    ...v,
    isFavorite: v.isFavorite ?? false,
    createdAt: Date.now(),
  });
}

export async function listVoices(): Promise<VoiceRecord[]> {
  return db.voices.orderBy("createdAt").reverse().toArray();
}

export async function deleteVoice(id: number): Promise<void> {
  await db.voices.delete(id);
}

export async function setFavorite(id: number, fav: boolean): Promise<void> {
  await db.voices.update(id, { isFavorite: fav });
}

export async function addHistory(
  h: Omit<HistoryRecord, "id" | "createdAt">,
): Promise<number> {
  const id = await db.history.add({ ...h, createdAt: Date.now() });
  const count = await db.history.count();
  if (count > HISTORY_CAP) {
    const overflow = count - HISTORY_CAP;
    const oldest = await db.history.orderBy("createdAt").limit(overflow).primaryKeys();
    await db.history.bulkDelete(oldest);
  }
  return id;
}

export async function listHistory(): Promise<HistoryRecord[]> {
  return db.history.orderBy("createdAt").reverse().toArray();
}

export async function clearHistory(): Promise<void> {
  await db.history.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npm run test -- idb.test
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/lib/idb.ts web/src/test/idb.test.ts
git commit -m "feat(web): IndexedDB store for voices + history (Dexie)"
```

---

## Task 19: `lib/audio.ts` — recording state machine

**Files:**
- Create: `web/src/lib/audio.ts`, `web/src/test/audio.test.ts`

- [ ] **Step 1: Write the failing tests**

`web/src/test/audio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Recorder } from "@/lib/audio";

describe("Recorder state machine", () => {
  it("starts in idle", () => {
    const r = new Recorder();
    expect(r.state).toBe("idle");
  });

  it("transitions idle -> requesting on start()", async () => {
    const r = new Recorder();
    r.requestStart(); // sync state change before getUserMedia resolves
    expect(r.state).toBe("requesting");
  });

  it("transitions to error on permission denial", async () => {
    const r = new Recorder({
      getUserMedia: () => Promise.reject(new Error("denied")),
    });
    await r.start().catch(() => {});
    expect(r.state).toBe("error");
    expect(r.lastError?.message).toBe("denied");
  });

  it("ignores stop() in idle", () => {
    const r = new Recorder();
    r.stop();
    expect(r.state).toBe("idle");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npm run test -- audio.test
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/audio.ts`**

`web/src/lib/audio.ts`:

```ts
export type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "error";

type Deps = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export class Recorder {
  state: RecorderState = "idle";
  lastError: Error | null = null;
  private chunks: BlobPart[] = [];
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private getUserMedia: NonNullable<Deps["getUserMedia"]>;

  constructor(deps: Deps = {}) {
    this.getUserMedia =
      deps.getUserMedia ??
      ((c) => navigator.mediaDevices.getUserMedia(c));
  }

  requestStart() {
    this.state = "requesting";
  }

  async start(): Promise<void> {
    this.requestStart();
    try {
      this.stream = await this.getUserMedia({ audio: true });
    } catch (e) {
      this.lastError = e as Error;
      this.state = "error";
      throw e;
    }
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.rec.start();
    this.state = "recording";
  }

  stop(): Promise<Blob | null> {
    if (this.state === "idle") return Promise.resolve(null);
    return new Promise((resolve) => {
      if (!this.rec) {
        this.state = "idle";
        resolve(null);
        return;
      }
      this.state = "stopping";
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec?.mimeType ?? "audio/webm" });
        this.chunks = [];
        this.rec = null;
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.state = "idle";
        resolve(blob);
      };
      this.rec.stop();
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npm run test -- audio.test
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/lib/audio.ts web/src/test/audio.test.ts
git commit -m "feat(web): Recorder state machine with permission error handling"
```

---

## Task 20: `ParamsPanel` component — auto-render from `ParamSpec[]`

**Files:**
- Create: `web/src/components/ParamsPanel.tsx`, `web/src/test/ParamsPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

`web/src/test/ParamsPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParamsPanel from "@/components/ParamsPanel";
import type { ParamSpec } from "@/lib/api";

const specs: ParamSpec[] = [
  { name: "exaggeration", label: "Exaggeration", type: "float", default: 0.5, min: 0, max: 2, step: 0.05 },
  { name: "is_fast", label: "Fast mode", type: "bool", default: false },
  { name: "lang", label: "Lang", type: "enum", default: "en", choices: ["en", "fr"] },
];

describe("ParamsPanel", () => {
  it("renders one control per spec", () => {
    render(<ParamsPanel specs={specs} values={{}} onChange={() => {}} />);
    expect(screen.getByLabelText(/exaggeration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fast mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lang$/i)).toBeInTheDocument();
  });

  it("emits onChange with merged values", () => {
    const onChange = vi.fn();
    render(<ParamsPanel specs={specs} values={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/exaggeration/i), { target: { value: "1.2" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exaggeration: 1.2 }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npm run test -- ParamsPanel
```

Expected: FAIL — component missing.

- [ ] **Step 3: Implement `ParamsPanel.tsx`**

`web/src/components/ParamsPanel.tsx`:

```tsx
import type { ParamSpec } from "@/lib/api";

type Props = {
  specs: ParamSpec[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export default function ParamsPanel({ specs, values, onChange }: Props) {
  function set(name: string, v: unknown) {
    onChange({ ...values, [name]: v });
  }
  return (
    <div className="space-y-4">
      {specs.map((s) => {
        const id = `param-${s.name}`;
        const current = (values[s.name] ?? s.default) as never;
        if (s.type === "float" || s.type === "int") {
          return (
            <label key={s.name} htmlFor={id} className="block space-y-1">
              <span className="text-sm">{s.label}</span>
              <input
                id={id}
                aria-label={s.label}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step ?? 0.01}
                value={current as number}
                onChange={(e) => set(s.name, Number(e.target.value))}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{String(current)}</span>
            </label>
          );
        }
        if (s.type === "bool") {
          return (
            <label key={s.name} htmlFor={id} className="flex items-center justify-between text-sm">
              <span>{s.label}</span>
              <input
                id={id}
                aria-label={s.label}
                type="checkbox"
                checked={!!current}
                onChange={(e) => set(s.name, e.target.checked)}
              />
            </label>
          );
        }
        // enum
        return (
          <label key={s.name} htmlFor={id} className="block space-y-1">
            <span className="text-sm">{s.label}</span>
            <select
              id={id}
              aria-label={s.label}
              value={current as string}
              onChange={(e) => set(s.name, e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1"
            >
              {(s.choices ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npm run test -- ParamsPanel
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/components/ParamsPanel.tsx web/src/test/ParamsPanel.test.tsx
git commit -m "feat(web): ParamsPanel auto-renders sliders/switches/selects from spec"
```

---

## Task 21: `TagBar` component — insert tag at textarea cursor

**Files:**
- Create: `web/src/components/TagBar.tsx`, `web/src/test/TagBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

`web/src/test/TagBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRef } from "react";
import TagBar from "@/components/TagBar";

function Host({ tags }: { tags: string[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <textarea ref={ref} aria-label="text" defaultValue="hello world" />
      <TagBar tags={tags} targetRef={ref} />
    </>
  );
}

describe("TagBar", () => {
  it("inserts tag at cursor position", () => {
    render(<Host tags={["[laugh]"]} />);
    const ta = screen.getByLabelText("text") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(5, 5);
    fireEvent.click(screen.getByRole("button", { name: /\[laugh\]/i }));
    expect(ta.value).toBe("hello[laugh] world");
  });

  it("renders nothing when tags is empty", () => {
    const { container } = render(<Host tags={[]} />);
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web && npm run test -- TagBar
```

Expected: FAIL — component missing.

- [ ] **Step 3: Implement `TagBar.tsx`**

`web/src/components/TagBar.tsx`:

```tsx
import type { RefObject } from "react";

type Props = {
  tags: string[];
  targetRef: RefObject<HTMLTextAreaElement>;
};

export default function TagBar({ tags, targetRef }: Props) {
  if (tags.length === 0) return null;
  function insert(tag: string) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = before + tag + after;
    const native = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    native?.call(el, before + tag + after);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const cursor = start + tag.length;
    el.setSelectionRange(cursor, cursor);
    el.focus();
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => insert(t)}
          className="text-xs px-2 py-0.5 rounded-md border border-border hover:bg-muted"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd web && npm run test -- TagBar
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/components/TagBar.tsx web/src/test/TagBar.test.tsx
git commit -m "feat(web): TagBar inserts paralinguistic tags at cursor"
```

---

## Task 22: `ModelPicker` + `DeviceBadge`

**Files:**
- Create: `web/src/components/ModelPicker.tsx`, `web/src/components/DeviceBadge.tsx`

- [ ] **Step 1: Implement `ModelPicker.tsx`**

```tsx
import type { ModelInfo } from "@/lib/api";

type Props = {
  models: ModelInfo[];
  activeId: string | null;
  loading: boolean;
  onPick: (id: string) => void;
};

export default function ModelPicker({ models, activeId, loading, onPick }: Props) {
  return (
    <select
      aria-label="Model"
      disabled={loading || models.length === 0}
      value={activeId ?? ""}
      onChange={(e) => onPick(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      <option value="" disabled>
        Choose model…
      </option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Implement `DeviceBadge.tsx`**

```tsx
import { useEffect, useState } from "react";

export default function DeviceBadge() {
  const [device, setDevice] = useState<string>("?");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setDevice(d.device))
      .catch(() => setDevice("offline"));
  }, []);
  return (
    <span className="text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground">
      {device}
    </span>
  );
}
```

- [ ] **Step 3: Manual sanity — build the project**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/src/components/ModelPicker.tsx web/src/components/DeviceBadge.tsx
git commit -m "feat(web): ModelPicker and DeviceBadge components"
```

---

## Task 23: `VoiceLibrary` component

**Files:**
- Create: `web/src/components/VoiceLibrary.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { deleteVoice, listVoices, setFavorite, type VoiceRecord } from "@/lib/idb";
import { cn } from "@/lib/utils";

type Props = {
  selectedId?: number;
  onSelect: (v: VoiceRecord) => void;
  refreshKey?: number;
};

export default function VoiceLibrary({ selectedId, onSelect, refreshKey }: Props) {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  useEffect(() => {
    listVoices().then(setVoices);
  }, [refreshKey]);

  if (voices.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved voices yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {voices.map((v) => (
        <li
          key={v.id}
          className={cn(
            "flex items-center justify-between rounded-md border border-border p-2",
            selectedId === v.id && "ring-1 ring-primary",
          )}
        >
          <button
            className="flex-1 text-left text-sm"
            onClick={() => onSelect(v)}
            type="button"
          >
            <div className="font-medium">{v.name}</div>
            <div className="text-xs text-muted-foreground">
              {(v.durationMs / 1000).toFixed(1)}s · {v.sampleRate} Hz
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={v.isFavorite ? "Unfavorite" : "Favorite"}
              onClick={() => setFavorite(v.id!, !v.isFavorite).then(() => listVoices().then(setVoices))}
              className="text-xs px-1"
            >
              {v.isFavorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => deleteVoice(v.id!).then(() => listVoices().then(setVoices))}
              className="text-xs px-1 text-muted-foreground"
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Build to confirm types**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/src/components/VoiceLibrary.tsx
git commit -m "feat(web): VoiceLibrary with favorite/delete/select"
```

---

## Task 24: `HistoryList` component

**Files:**
- Create: `web/src/components/HistoryList.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from "react";
import { listHistory, type HistoryRecord } from "@/lib/idb";

type Props = {
  refreshKey?: number;
  onRegenerate: (h: HistoryRecord) => void;
};

export default function HistoryList({ refreshKey, onRegenerate }: Props) {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    listHistory().then(setItems);
  }, [refreshKey]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No generations yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((h) => {
        const url = URL.createObjectURL(h.audioBlob);
        return (
          <li key={h.id} className="rounded-md border border-border p-2 space-y-2">
            <div className="text-sm line-clamp-2">{h.text}</div>
            <div className="text-xs text-muted-foreground">
              {h.modelId} · {h.language ?? "—"} · {new Date(h.createdAt).toLocaleTimeString()}
            </div>
            <audio controls src={url} className="w-full" />
            <div className="flex justify-end gap-2">
              <a href={url} download={`${h.id}.wav`} className="text-xs underline">download</a>
              <button type="button" className="text-xs underline" onClick={() => onRegenerate(h)}>
                regenerate
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/src/components/HistoryList.tsx
git commit -m "feat(web): HistoryList with download and regenerate"
```

---

## Task 25: `VoiceComposer` component

**Files:**
- Create: `web/src/components/VoiceComposer.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useRef, useState } from "react";
import { Recorder } from "@/lib/audio";
import { addVoice } from "@/lib/idb";

type Props = {
  onSaved: () => void;
};

export default function VoiceComposer({ onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const [recState, setRecState] = useState<"idle" | "recording" | "stopping" | "error">("idle");
  const [name, setName] = useState("");

  async function importBlob(blob: Blob, defaultName: string) {
    const arr = new Uint8Array(await blob.arrayBuffer());
    // we can't reliably read sampleRate here without an AudioContext decode; fallback to 24k.
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(arr.buffer.slice(0));
    await addVoice({
      name: name || defaultName || `voice-${Date.now()}`,
      blob,
      sampleRate: buf.sampleRate,
      durationMs: Math.round(buf.duration * 1000),
    });
    setName("");
    onSaved();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await importBlob(f, f.name.replace(/\.[^.]+$/, ""));
    e.target.value = "";
  }

  async function startRec() {
    const r = new Recorder();
    recorderRef.current = r;
    try {
      await r.start();
      setRecState("recording");
    } catch {
      setRecState("error");
    }
  }

  async function stopRec() {
    setRecState("stopping");
    const blob = await recorderRef.current?.stop();
    setRecState("idle");
    if (blob) await importBlob(blob, "recorded");
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Voice name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          Upload .wav/.mp3
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onFile} />
        {recState === "recording" ? (
          <button
            type="button"
            onClick={stopRec}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
          >
            Stop & save
          </button>
        ) : (
          <button
            type="button"
            onClick={startRec}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            Record
          </button>
        )}
      </div>
      {recState === "error" && (
        <p className="text-xs text-red-500">Microphone permission denied.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/src/components/VoiceComposer.tsx
git commit -m "feat(web): VoiceComposer (upload + record) saves to IndexedDB"
```

---

## Task 26: Compose `Studio` page — full end-to-end flow

**Files:**
- Modify: `web/src/pages/Studio.tsx`

- [ ] **Step 1: Replace the Studio skeleton with the full composition**

`web/src/pages/Studio.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { activateModel, generate, getActiveModel, listModels, type ModelInfo } from "@/lib/api";
import { addHistory, listVoices, type HistoryRecord, type VoiceRecord } from "@/lib/idb";
import DeviceBadge from "@/components/DeviceBadge";
import HistoryList from "@/components/HistoryList";
import ModelPicker from "@/components/ModelPicker";
import ParamsPanel from "@/components/ParamsPanel";
import TagBar from "@/components/TagBar";
import VoiceComposer from "@/components/VoiceComposer";
import VoiceLibrary from "@/components/VoiceLibrary";

export default function Studio() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [tab, setTab] = useState<"voices" | "history">("voices");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [selectedVoice, setSelectedVoice] = useState<VoiceRecord | undefined>();
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [libraryKey, setLibraryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listModels().then((m) => {
      setModels(m);
      if (m[0]) setActiveId((cur) => cur ?? m[0].id);
    });
    getActiveModel().then((s) => setActiveId((cur) => cur ?? s.id));
  }, []);

  const active = useMemo(() => models.find((m) => m.id === activeId), [models, activeId]);

  useEffect(() => {
    setParams(
      Object.fromEntries((active?.params ?? []).map((p) => [p.name, p.default])),
    );
    setLanguage(active?.languages[0]?.code);
  }, [active?.id]);

  async function pickModel(id: string) {
    setLoadingModel(true);
    setErr(null);
    try {
      await activateModel(id);
      setActiveId(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingModel(false);
    }
  }

  async function onGenerate(reuse?: HistoryRecord) {
    if (!active) return;
    if (active.supports_voice_clone && !selectedVoice && !reuse?.voiceId) {
      setErr("Pick or record a reference voice first.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const refBlob = selectedVoice?.blob;
      const inputText = reuse?.text ?? text;
      const inputLang = reuse?.language ?? language;
      const inputParams = reuse?.params ?? params;
      const out = await generate({
        modelId: active.id,
        text: inputText,
        language: inputLang,
        params: inputParams,
        reference: refBlob,
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(out);
      });
      await addHistory({
        text: inputText,
        modelId: active.id,
        voiceId: selectedVoice?.id,
        language: inputLang,
        params: inputParams,
        audioBlob: out,
      });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="font-medium">Chatterbox Voice Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <ModelPicker
            models={models}
            activeId={activeId}
            loading={loadingModel || busy}
            onPick={pickModel}
          />
          <DeviceBadge />
        </div>
      </header>

      {loadingModel && (
        <div className="bg-muted text-sm px-6 py-2">Loading model… first activation can take 30–60s.</div>
      )}
      {err && <div className="bg-red-500/10 text-red-400 text-sm px-6 py-2">{err}</div>}

      <main className="flex-1 grid lg:grid-cols-[1fr_420px] gap-6 p-6">
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Reference voice</h2>
            <VoiceComposer onSaved={() => setLibraryKey((k) => k + 1)} />
            <VoiceLibrary
              selectedId={selectedVoice?.id}
              onSelect={setSelectedVoice}
              refreshKey={libraryKey}
            />
          </div>

          {active?.languages && active.languages.length > 1 && (
            <div className="space-y-1">
              <label htmlFor="lang-select" className="text-sm font-medium">Language</label>
              <select
                id="lang-select"
                value={language ?? ""}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {active.languages.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="prompt" className="text-sm font-medium">Text</label>
            <textarea
              id="prompt"
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Type what the voice should say…"
            />
            <div className="flex items-center justify-between">
              <TagBar tags={active?.paralinguistic_tags ?? []} targetRef={textRef} />
              <span className="text-xs text-muted-foreground">{text.length} chars</span>
            </div>
          </div>

          {active && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Parameters</h2>
              <ParamsPanel specs={active.params} values={params} onChange={setParams} />
            </div>
          )}

          <button
            type="button"
            onClick={() => onGenerate()}
            disabled={busy || loadingModel || !text.trim()}
            className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate"}
          </button>

          {outputUrl && (
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Output</h2>
              <audio controls src={outputUrl} className="w-full" />
              <a href={outputUrl} download="chatterbox.wav" className="text-xs underline">download</a>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("voices")}
              className={`flex-1 rounded-md px-2 py-1 text-sm ${tab === "voices" ? "bg-muted" : ""}`}
            >
              Voices
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`flex-1 rounded-md px-2 py-1 text-sm ${tab === "history" ? "bg-muted" : ""}`}
            >
              History
            </button>
          </div>
          {tab === "voices" ? (
            <VoiceLibrary
              selectedId={selectedVoice?.id}
              onSelect={setSelectedVoice}
              refreshKey={libraryKey}
            />
          ) : (
            <HistoryList refreshKey={historyKey} onRegenerate={onGenerate} />
          )}
        </aside>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Build to confirm**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/src/pages/Studio.tsx
git commit -m "feat(web): Studio composes full generate flow + voice library + history"
```

---

## Task 27: SSE-driven loading banner

**Files:**
- Create: `web/src/components/LoadingBanner.tsx`
- Modify: `web/src/pages/Studio.tsx` (use `streamActiveEvents`)

- [ ] **Step 1: Implement banner**

`web/src/components/LoadingBanner.tsx`:

```tsx
type Props = { visible: boolean; message: string };

export default function LoadingBanner({ visible, message }: Props) {
  if (!visible) return null;
  return (
    <div className="bg-primary/15 text-primary text-sm px-6 py-2 border-b border-primary/30">
      {message}
    </div>
  );
}
```

- [ ] **Step 2: Wire to Studio**

In `web/src/pages/Studio.tsx`:

1. Add import:

```ts
import { streamActiveEvents } from "@/lib/api";
import LoadingBanner from "@/components/LoadingBanner";
```

2. Add a `useEffect` that subscribes once on mount:

```tsx
  useEffect(() => {
    const close = streamActiveEvents((evt) => {
      if (evt.status === "loading") setLoadingModel(true);
      if (evt.status === "loaded" || evt.status === "error") setLoadingModel(false);
      if (evt.status === "loaded" && evt.id) setActiveId(evt.id);
      if (evt.status === "error" && evt.error) setErr(evt.error);
    });
    return close;
  }, []);
```

3. Replace the inline "Loading model…" `<div>` with:

```tsx
<LoadingBanner visible={loadingModel} message="Loading model… first activation can take 30–60s." />
```

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/src/components/LoadingBanner.tsx web/src/pages/Studio.tsx
git commit -m "feat(web): SSE-driven model-loading banner"
```

---

## Task 28: `scripts/start.sh` — macOS/Linux one-click

**Files:**
- Create: `scripts/start.sh`

- [ ] **Step 1: Write the script**

`scripts/start.sh`:

```bash
#!/usr/bin/env bash
# One-click: venv -> install -> build SPA -> serve -> open browser.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v python3.11 >/dev/null 2>&1; then
    if command -v python3 >/dev/null 2>&1; then PY=python3; else
        echo "ERROR: python3.11 (or python3) not found. Install Python 3.11+." >&2
        exit 1
    fi
else
    PY=python3.11
fi

if [ ! -d .venv ]; then
    echo "==> Creating venv (.venv) with $PY"
    "$PY" -m venv .venv
fi
# shellcheck source=/dev/null
. .venv/bin/activate

REQ_HASH=$(shasum requirements.txt | awk '{print $1}')
MARKER=".venv/.installed-marker"
if [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$REQ_HASH" ]; then
    echo "==> Installing python deps"
    pip install --upgrade pip
    pip install -r requirements.txt
    echo "$REQ_HASH" > "$MARKER"
fi

if [ ! -d web/node_modules ]; then
    echo "==> Installing web deps"
    (cd web && npm ci)
fi

if [ ! -d server/static ] || [ ! -f web/dist/index.html ]; then
    echo "==> Building web"
    (cd web && npm run build)
    rm -rf server/static
    mkdir -p server/static
    cp -R web/dist/* server/static/
fi

export PYTORCH_ENABLE_MPS_FALLBACK="${PYTORCH_ENABLE_MPS_FALLBACK:-1}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-7860}"
URL="http://$HOST:$PORT"

echo "==> Serving on $URL"
( sleep 2 && python -m webbrowser "$URL" ) &
exec uvicorn server.main:app --host "$HOST" --port "$PORT"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/start.sh
```

- [ ] **Step 3: Manual smoke**

In a separate terminal:

```bash
./scripts/start.sh
```

Expected: server boots, browser opens to `http://127.0.0.1:7860`, page loads. `Ctrl+C` to stop.

- [ ] **Step 4: Commit**

```bash
git add scripts/start.sh
git commit -m "chore(scripts): one-click start.sh (mac/linux)"
```

---

## Task 29: `scripts/start.ps1` and `scripts/start.bat` — Windows

**Files:**
- Create: `scripts/start.ps1`, `scripts/start.bat`

- [ ] **Step 1: Write `start.ps1`**

`scripts/start.ps1`:

```powershell
param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 7860
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot/.."
Set-Location $Root

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Error "Python launcher 'py' not found. Install Python 3.11+ from python.org."
    exit 1
}

if (-not (Test-Path ".venv")) {
    Write-Host "==> Creating venv (.venv)"
    & py -3.11 -m venv .venv
}

$activate = ".venv/Scripts/Activate.ps1"
. $activate

$reqHash = (Get-FileHash requirements.txt -Algorithm SHA1).Hash
$marker = ".venv/.installed-marker"
if (-not (Test-Path $marker) -or (Get-Content $marker) -ne $reqHash) {
    Write-Host "==> Installing python deps"
    pip install --upgrade pip
    pip install -r requirements.txt
    Set-Content $marker $reqHash
}

if (-not (Test-Path "web/node_modules")) {
    Write-Host "==> Installing web deps"
    Push-Location web
    npm ci
    Pop-Location
}

if (-not (Test-Path "server/static/index.html")) {
    Write-Host "==> Building web"
    Push-Location web
    npm run build
    Pop-Location
    if (Test-Path "server/static") { Remove-Item -Recurse -Force "server/static" }
    New-Item -ItemType Directory -Force "server/static" | Out-Null
    Copy-Item -Recurse "web/dist/*" "server/static/"
}

$env:PYTORCH_ENABLE_MPS_FALLBACK = "1"
$Url = "http://${BindHost}:$Port"
Write-Host "==> Serving on $Url"
Start-Process $Url
uvicorn server.main:app --host $BindHost --port $Port
```

- [ ] **Step 2: Write `start.bat`**

`scripts/start.bat`:

```bat
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
```

- [ ] **Step 3: Commit**

```bash
git add scripts/start.ps1 scripts/start.bat
git commit -m "chore(scripts): one-click start.ps1 and start.bat (windows)"
```

---

## Task 30: `Dockerfile` + `.dockerignore` for HF Spaces

**Files:**
- Create: `Dockerfile`, `.dockerignore`

- [ ] **Step 1: Write `Dockerfile`**

```Dockerfile
# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.11-slim
ENV HF_HOME=/tmp/hf \
    PYTHONUNBUFFERED=1 \
    PORT=7860
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ server/
COPY --from=web /web/dist server/static/
EXPOSE 7860
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

- [ ] **Step 2: Write `.dockerignore`**

```
.venv
__pycache__
*.pyc
node_modules
web/dist
server/static
.pytest_cache
.git
docs
*.md
!README.md
```

- [ ] **Step 3: Local docker build sanity check**

```bash
docker build -t chatterbox-voice-studio .
```

Expected: build succeeds (this is large; downloads torch). If Docker is not installed on the dev machine, skip and rely on HF Spaces to build.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "chore(deploy): Dockerfile (multi-stage) and .dockerignore for HF Spaces"
```

---

## Task 31: README + frontend-design polish pass

**Files:**
- Create: `README.md`
- Modify: any UI files the frontend-design skill produces during polish

- [ ] **Step 1: Write `README.md`**

```markdown
# Chatterbox Voice Studio

A multi-platform browser-based voice cloning studio for the Chatterbox TTS family
(English, Turbo, Multilingual). Runs locally on macOS (MPS), Linux (CUDA/CPU),
and Windows (CUDA/CPU). Deploys to Hugging Face Spaces (Free CPU by default,
ZeroGPU-decorator-ready).

## Quick start (local)

### macOS / Linux

    ./scripts/start.sh

### Windows

    scripts\start.bat

The script creates a venv, installs Python and Node deps, builds the SPA,
and opens the studio at http://127.0.0.1:7860.

## Hugging Face Spaces

This repo's `Dockerfile` is what HF Spaces uses to build the image.
On Free CPU it runs as-is — generation will be slow (30–90s per clip).

To get GPU on Spaces:

- Subscribe to HF Pro and pick "ZeroGPU" hardware in your Space settings.
  No code change needed; the `@spaces.GPU` decorator activates.
- Or pick a paid GPU (T4 small / A10G).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `CHATTERBOX_DEVICE` | (auto) | Force `cuda` / `mps` / `cpu`. |
| `HF_HOME` | `/tmp/hf` | Hugging Face cache. |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma list of allowed CORS origins. |
| `PYTORCH_ENABLE_MPS_FALLBACK` | `1` (mac) | CPU fallback for unimplemented MPS ops. |

## Models

| ID | Source | Languages | Tags |
|---|---|---|---|
| `chatterbox-en` | `chatterbox.tts.ChatterboxTTS` | English | — |
| `chatterbox-turbo` | `chatterbox.tts_turbo.ChatterboxTurboTTS` | English | `[laugh]` `[cough]` `[chuckle]` |
| `chatterbox-mtl` | `chatterbox.mtl_tts.ChatterboxMultilingualTTS` | 23 langs | (TBD) |

## Development

Backend tests:

    .venv/bin/pytest

Frontend tests:

    cd web && npm run test

Frontend dev server (with API proxy):

    cd web && npm run dev    # http://localhost:5173

## Smoke test

With the server running:

    scripts/smoke.sh
```

- [ ] **Step 2: Run frontend-design polish pass**

Invoke the `frontend-design` skill on the UI files. Scope: revisit visual design of the Studio page (header polish, spacing, color tokens, typography, micro-interactions, focus states) and produce diff-quality commits. Stay within the existing component structure — don't rebuild components, just refine visuals.

After the design pass, run a final visual smoke:

```bash
./scripts/start.sh
```

Open the browser and verify the design refinements visually.

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: README with quick start, deploy notes, and model table"
# any frontend-design pass diffs follow as their own commits
```

- [ ] **Step 4: Push**

```bash
git push origin master
```

Expected: pushes cleanly to `git@github.com:techfreakworm/chatterbox-voicecloner.git`.

---

## Self-Review

**Spec coverage:**

- §1 Goals — covered by Tasks 1–31 collectively. Multi-platform: Tasks 28–30. HF Spaces: Task 30. Stateless server: Task 18 (no server DB).
- §2 Decisions — A/A/A/A reflected in tech stack and architecture.
- §3.1 Repo layout — Task 1 + per-task file creation matches the spec layout.
- §3.2 Process model — Task 28 (start.sh) and Task 30 (Dockerfile).
- §3.3 Device selection — Task 2.
- §4 Adapters — Tasks 11–13.
- §5 Registry — Task 7.
- §6 REST API — Tasks 8 (health), 9 (models, active), 10 (activate, events), 11 (generate).
- §7 ZeroGPU — Task 5.
- §8 Frontend — Tasks 15–27.
- §9 Start scripts — Tasks 28–29.
- §10 Dockerfile — Task 30.
- §11 Error handling — woven into Tasks 7 (load failure), 11 (validation, not-found, generation failures), 18 (LRU cap).
- §12 Testing — pytest in Tasks 2–11; vitest in Tasks 17–21.
- §13 Open TBDs — `chatterbox-mtl` `paralinguistic_tags = []` is explicitly empty in Task 13 with a comment to revisit; param ranges per §4.2 used as-is.
- §14 YAGNI — none of those features are in any task.
- §15 Phases — preserved in task order.

**Placeholder scan:** No `TBD`/`TODO`/`fill in` lines in any task body. Every step shows the actual code or command.

**Type consistency:**
- `Lang`, `ParamSpec` defined in Task 4 (Pydantic) and used in Tasks 6, 11, 12, 13. Frontend mirror types in Task 17.
- `ModelAdapter.id` is a `ClassVar[str]` everywhere.
- `Registry.get_or_load`, `status`, `list_models`, `stream_events` consistent across Tasks 7–10.
- `addVoice`, `addHistory`, `listVoices`, `listHistory`, `setFavorite`, `deleteVoice`, `HISTORY_CAP` consistent across Tasks 18, 23–26.
- `streamActiveEvents` introduced in Task 17 and used in Task 27.

**Commit attribution:** Every `git commit` line uses a short `-m` message with **no** Claude co-author trailer and **no** `--author` override, in line with `CLAUDE.md`.

No issues to fix.

---

*End of plan.*
