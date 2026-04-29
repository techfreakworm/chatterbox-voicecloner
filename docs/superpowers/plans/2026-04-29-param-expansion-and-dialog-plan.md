# Param Expansion + Dialog Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand each Chatterbox adapter to expose its full parameter surface (samplers + reproducibility seed), gate seed and rarely-used params behind an Advanced disclosure, and add a Dialog mode that synthesizes multi-speaker scenes by parsing `SPEAKER A:` / `SPEAKER B:` text and concatenating per-turn outputs.

**Architecture:** Dialog is a *workflow*, not a model: `/api/models` continues to list three adapters (en/turbo/mtl); a new `/api/generate/dialog` endpoint accepts 1–4 reference clips and an `engine_id`, parses the dialog text, dispatches per turn through the existing registry, and returns a single concatenated WAV. Each adapter's `generate()` gains a seed param, applies it via `torch.manual_seed`, and returns the seed actually used so the endpoint can echo it back via `X-Seed-Used`.

**Tech Stack:** Python 3.11, FastAPI, torch (cuda/mps/cpu), `chatterbox-tts==0.1.7`; React 18, TypeScript, Vite, Tailwind, Dexie.

**Repo:** `/Users/techfreakworm/Projects/llm/chatterbox-voicecloner`

**Spec:** `docs/superpowers/specs/2026-04-29-param-expansion-and-dialog-design.md`

**Repo conventions (from `CLAUDE.md`):**
- Mayank Gupta is the **sole author** on every commit. Never include a `Co-Authored-By: Claude ...` trailer or "Generated with Claude Code" footer.
- Server is stateless — voice library and history live in browser IndexedDB only.
- Multi-platform: must work on macOS (MPS), Linux (CUDA/CPU), Windows (CUDA/CPU), HF Spaces.

**TDD policy:** Pure logic (parsers, helpers, schema validation, frontend libs/components) is written test-first. Real-model integration is verified manually via `scripts/smoke.sh` — not in CI.

---

## File Structure (delta vs current main)

```
chatterbox-voicecloner/
├── server/
│   ├── seed.py                                NEW (Task 2)
│   ├── dialog.py                              NEW (Tasks 11, 12)
│   ├── schemas.py                             MODIFY (Task 1)
│   ├── main.py                                MODIFY (Tasks 3, 12)
│   └── models/
│       ├── base.py                            MODIFY (Task 3)
│       ├── chatterbox_en.py                   MODIFY (Task 4)
│       ├── chatterbox_turbo.py                MODIFY (Task 5)
│       └── chatterbox_mtl.py                  MODIFY (Task 6)
├── tests/
│   ├── conftest.py                            MODIFY (Task 3)
│   ├── test_schemas.py                        MODIFY (Task 1)
│   ├── test_seed.py                           NEW (Task 2)
│   ├── test_main_generate.py                  MODIFY (Task 3)
│   ├── test_adapter_contract.py               MODIFY (Task 7)
│   ├── test_dialog_parser.py                  NEW (Task 11)
│   └── test_dialog_endpoint.py                NEW (Task 12)
├── web/src/
│   ├── components/
│   │   ├── ModeToggle.tsx                     NEW (Task 14)
│   │   ├── SpeakerSlot.tsx                    NEW (Task 14)
│   │   ├── DialogComposer.tsx                 NEW (Task 15)
│   │   ├── ParamsPanel.tsx                    MODIFY (Tasks 8, 9)
│   │   └── HistoryList.tsx                    MODIFY (Task 10)
│   ├── lib/
│   │   ├── api.ts                             MODIFY (Tasks 8, 10, 13)
│   │   └── idb.ts                             MODIFY (Task 10)
│   ├── pages/Studio.tsx                       MODIFY (Task 16)
│   └── test/
│       ├── ParamsPanel.test.tsx               MODIFY (Tasks 8, 9)
│       ├── idb.test.ts                        MODIFY (Task 10)
│       ├── api.test.ts                        MODIFY (Task 13)
│       └── DialogComposer.test.tsx            NEW (Task 15)
└── scripts/smoke.sh                           MODIFY (Task 17)
```

---

## Task 1: Add `group` to `ParamSpec`

**Files:**
- Modify: `server/schemas.py`
- Test: `tests/test_schemas.py`

- [ ] **Step 1: Extend `tests/test_schemas.py` with two new cases**

Append at the bottom of `tests/test_schemas.py`:

```python
def test_param_spec_default_group_is_basic():
    p = ParamSpec(name="t", label="T", type="float", default=0.5, min=0.0, max=1.0)
    assert p.group == "basic"


def test_param_spec_advanced_group_round_trips():
    p = ParamSpec(
        name="seed", label="Seed", type="int", default=-1, min=-1, group="advanced",
    )
    assert p.group == "advanced"
    assert p.model_dump()["group"] == "advanced"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_schemas.py -v
```

Expected: 2 failures with "AttributeError: 'ParamSpec' object has no attribute 'group'" or pydantic ValidationError on the second test (extra field).

- [ ] **Step 3: Add `group` to `ParamSpec` in `server/schemas.py`**

In `server/schemas.py`, change the imports + add `ParamGroup` + add field:

```python
ParamType = Literal["float", "int", "bool", "enum"]
ParamGroup = Literal["basic", "advanced"]
ModelStatus = Literal["idle", "loading", "loaded", "error"]
```

Add the `group` field to `ParamSpec` (right after `help`):

```python
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
    group: ParamGroup = "basic"
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_schemas.py -v
```

Expected: 11 passed (9 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server/schemas.py tests/test_schemas.py
git commit -m "feat(schemas): add group field to ParamSpec (basic/advanced)"
```

---

## Task 2: `apply_seed` helper

**Files:**
- Create: `server/seed.py`
- Test: `tests/test_seed.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_seed.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_seed.py -v
```

Expected: ModuleNotFoundError: No module named 'server.seed'.

- [ ] **Step 3: Write the implementation**

`server/seed.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_seed.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add server/seed.py tests/test_seed.py
git commit -m "feat(seed): apply_seed helper that returns the seed actually used"
```

---

## Task 3: Update generate contract to return `seed_used` and emit `X-Seed-Used` header

**Files:**
- Modify: `server/models/base.py`
- Modify: `server/models/chatterbox_en.py`
- Modify: `server/models/chatterbox_turbo.py`
- Modify: `server/models/chatterbox_mtl.py`
- Modify: `tests/conftest.py` (FakeAdapter)
- Modify: `server/main.py` (`/api/generate` route)
- Modify: `tests/test_main_generate.py`

This task moves all four `generate()` implementations and the API route at once because the return-tuple shape is changing. After this task the contract is:

```
adapter.generate(...) -> tuple[bytes, int, int]  # (wav_bytes, sample_rate, seed_used)
```

- [ ] **Step 1: Update the Protocol in `server/models/base.py`**

Change the `generate` line in the `ModelAdapter` Protocol:

```python
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int, int]: ...   # (wav_bytes, sample_rate, seed_used)
```

- [ ] **Step 2: Update `FakeAdapter` in `tests/conftest.py`**

Find the `generate` method on `FakeAdapter` and replace with:

```python
    def generate(self, text, reference_wav_path, language, params):
        # FakeAdapter never actually applies a seed; report the input or 0.
        seed_in = params.get("seed", 0) if isinstance(params, dict) else 0
        seed_used = 0 if seed_in is None or seed_in < 0 else int(seed_in)
        return (b"FAKEWAV", 24000, seed_used)
```

- [ ] **Step 3: Update `chatterbox_en.py`**

In `server/models/chatterbox_en.py`, add an import at the top:

```python
from server.seed import apply_seed
```

Replace the `generate` method:

```python
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        seed_used = apply_seed(params.get("seed"))
        wav = self._model.generate(
            text,
            audio_prompt_path=reference_wav_path,
            exaggeration=float(params.get("exaggeration", 0.5)),
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
        return buf.getvalue(), sr, seed_used
```

- [ ] **Step 4: Update `chatterbox_turbo.py`**

In `server/models/chatterbox_turbo.py`, add `from server.seed import apply_seed` at the top, then replace `generate`:

```python
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        seed_used = apply_seed(params.get("seed"))
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
        return buf.getvalue(), sr, seed_used
```

- [ ] **Step 5: Update `chatterbox_mtl.py`**

In `server/models/chatterbox_mtl.py`, add `from server.seed import apply_seed` at the top, then replace `generate`:

```python
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        if not language:
            raise ValueError("language is required for chatterbox-mtl")
        seed_used = apply_seed(params.get("seed"))
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
        return buf.getvalue(), sr, seed_used
```

- [ ] **Step 6: Update `/api/generate` to set `X-Seed-Used` header**

In `server/main.py`, find the `generate` route and replace its body. The change: capture the third tuple element and add the header.

Locate the `try` block that calls `gen_fn(...)` and replace from `gen_fn = decorate(adapter.generate)` through the `return Response(...)` line:

```python
        gen_fn = decorate(adapter.generate)
        try:
            wav_bytes, _sr, seed_used = gen_fn(
                text, ref_path, language, json.loads(params or "{}")
            )
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "generation_failed", "message": str(exc)}},
            )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"X-Seed-Used": str(seed_used), "Access-Control-Expose-Headers": "X-Seed-Used"},
        )
```

- [ ] **Step 7: Update `tests/test_main_generate.py` to assert the new header**

Replace the body of `test_generate_returns_wav_bytes`:

```python
async def test_generate_returns_wav_bytes(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
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
    assert r.headers["x-seed-used"] == "0"
```

- [ ] **Step 8: Run the full backend test suite**

```bash
.venv/bin/pytest -q
```

Expected: 49 passed (47 prior + 2 new schemas + 6 new seed = 55; minus 0 since no tests deleted; tests/test_main_generate.py count unchanged but now asserts the header).

If any tests fail, the most likely cause is an adapter file missing the `from server.seed import apply_seed` import — re-check Steps 3, 4, 5.

- [ ] **Step 9: Commit**

```bash
git add server/models/base.py server/models/chatterbox_en.py server/models/chatterbox_turbo.py server/models/chatterbox_mtl.py server/main.py tests/conftest.py tests/test_main_generate.py
git commit -m "feat(api): adapter generate returns seed_used; expose X-Seed-Used header"
```

---

## Task 4: Expand `chatterbox-en` parameter list

**Files:**
- Modify: `server/models/chatterbox_en.py`

- [ ] **Step 1: Replace the `params` ClassVar in `chatterbox_en.py`**

```python
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(
            name="exaggeration", label="Exaggeration", type="float",
            default=0.5, min=0.0, max=2.0, step=0.05,
            help="Higher = more expressive prosody.",
            group="basic",
        ),
        ParamSpec(
            name="cfg_weight", label="CFG weight", type="float",
            default=0.5, min=0.0, max=1.0, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="temperature", label="Temperature", type="float",
            default=0.8, min=0.1, max=1.5, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="seed", label="Seed", type="int",
            default=-1, min=-1, step=1,
            help="-1 draws a random seed each time.",
            group="advanced",
        ),
        ParamSpec(
            name="repetition_penalty", label="Repetition penalty", type="float",
            default=1.2, min=1.0, max=3.0, step=0.05,
            group="advanced",
        ),
        ParamSpec(
            name="min_p", label="Min p", type="float",
            default=0.05, min=0.0, max=1.0, step=0.01,
            group="advanced",
        ),
        ParamSpec(
            name="top_p", label="Top p", type="float",
            default=1.0, min=0.0, max=1.0, step=0.01,
            group="advanced",
        ),
    ]
```

- [ ] **Step 2: Replace the inner `_model.generate(...)` call inside `Adapter.generate` to forward the new params**

Inside `chatterbox_en.py`, the `wav = self._model.generate(...)` block becomes:

```python
        wav = self._model.generate(
            text,
            audio_prompt_path=reference_wav_path,
            exaggeration=float(params.get("exaggeration", 0.5)),
            cfg_weight=float(params.get("cfg_weight", 0.5)),
            temperature=float(params.get("temperature", 0.8)),
            repetition_penalty=float(params.get("repetition_penalty", 1.2)),
            min_p=float(params.get("min_p", 0.05)),
            top_p=float(params.get("top_p", 1.0)),
        )
```

- [ ] **Step 3: Run the suite**

```bash
.venv/bin/pytest -q tests/test_adapter_contract.py tests/test_main_generate.py
```

Expected: 4 passed (3 contract + 3 generate, depending on parameterization). No regressions.

- [ ] **Step 4: Commit**

```bash
git add server/models/chatterbox_en.py
git commit -m "feat(models): expand chatterbox-en params (seed, repetition_penalty, min_p, top_p)"
```

---

## Task 5: Expand `chatterbox-turbo` parameter list

**Files:**
- Modify: `server/models/chatterbox_turbo.py`

- [ ] **Step 1: Replace the `params` ClassVar**

```python
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(
            name="temperature", label="Temperature", type="float",
            default=0.8, min=0.1, max=1.5, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="top_p", label="Top p", type="float",
            default=0.95, min=0.0, max=1.0, step=0.01,
            group="basic",
        ),
        ParamSpec(
            name="repetition_penalty", label="Repetition penalty", type="float",
            default=1.2, min=1.0, max=3.0, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="seed", label="Seed", type="int",
            default=-1, min=-1, step=1,
            help="-1 draws a random seed each time.",
            group="advanced",
        ),
        ParamSpec(
            name="top_k", label="Top k", type="int",
            default=1000, min=1, max=4000, step=1,
            group="advanced",
        ),
        ParamSpec(
            name="exaggeration", label="Exaggeration", type="float",
            default=0.0, min=0.0, max=2.0, step=0.05,
            group="advanced",
        ),
        ParamSpec(
            name="cfg_weight", label="CFG weight", type="float",
            default=0.0, min=0.0, max=1.0, step=0.05,
            group="advanced",
        ),
    ]
```

- [ ] **Step 2: Replace the inner `_model.generate(...)` call inside `Adapter.generate`**

```python
        wav = self._model.generate(
            text,
            audio_prompt_path=reference_wav_path,
            exaggeration=float(params.get("exaggeration", 0.0)),
            cfg_weight=float(params.get("cfg_weight", 0.0)),
            temperature=float(params.get("temperature", 0.8)),
            top_p=float(params.get("top_p", 0.95)),
            top_k=int(params.get("top_k", 1000)),
            repetition_penalty=float(params.get("repetition_penalty", 1.2)),
        )
```

- [ ] **Step 3: Run the suite**

```bash
.venv/bin/pytest -q
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add server/models/chatterbox_turbo.py
git commit -m "feat(models): expand chatterbox-turbo params (seed, top_k, exaggeration, cfg_weight, etc.)"
```

---

## Task 6: Expand `chatterbox-mtl` parameter list

**Files:**
- Modify: `server/models/chatterbox_mtl.py`

- [ ] **Step 1: Replace the `params` ClassVar**

```python
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(
            name="exaggeration", label="Exaggeration", type="float",
            default=0.5, min=0.0, max=2.0, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="cfg_weight", label="CFG weight", type="float",
            default=0.5, min=0.0, max=1.0, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="temperature", label="Temperature", type="float",
            default=0.8, min=0.1, max=1.5, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="repetition_penalty", label="Repetition penalty", type="float",
            default=2.0, min=1.0, max=3.0, step=0.05,
            group="basic",
        ),
        ParamSpec(
            name="seed", label="Seed", type="int",
            default=-1, min=-1, step=1,
            help="-1 draws a random seed each time.",
            group="advanced",
        ),
        ParamSpec(
            name="min_p", label="Min p", type="float",
            default=0.05, min=0.0, max=1.0, step=0.01,
            group="advanced",
        ),
        ParamSpec(
            name="top_p", label="Top p", type="float",
            default=1.0, min=0.0, max=1.0, step=0.01,
            group="advanced",
        ),
    ]
```

- [ ] **Step 2: Replace the inner `_model.generate(...)` call inside `Adapter.generate`**

```python
        wav = self._model.generate(
            text,
            language_id=language,
            audio_prompt_path=reference_wav_path,
            exaggeration=float(params.get("exaggeration", 0.5)),
            cfg_weight=float(params.get("cfg_weight", 0.5)),
            temperature=float(params.get("temperature", 0.8)),
            repetition_penalty=float(params.get("repetition_penalty", 2.0)),
            min_p=float(params.get("min_p", 0.05)),
            top_p=float(params.get("top_p", 1.0)),
        )
```

- [ ] **Step 3: Run the suite**

```bash
.venv/bin/pytest -q
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add server/models/chatterbox_mtl.py
git commit -m "feat(models): expand chatterbox-mtl params (seed, repetition_penalty, min_p, top_p)"
```

---

## Task 7: Adapter contract test enforces valid `group`

**Files:**
- Modify: `tests/test_adapter_contract.py`

- [ ] **Step 1: Add a new parameterized test**

Append at the bottom of `tests/test_adapter_contract.py`:

```python
@pytest.mark.parametrize("module_name", ADAPTER_MODULES)
def test_adapter_param_groups_are_valid(module_name):
    mod = importlib.import_module(module_name)
    cls = getattr(mod, "Adapter")
    for p in cls.params:
        assert p.group in {"basic", "advanced"}, (
            f"{cls.id}.{p.name} has invalid group: {p.group!r}"
        )
```

- [ ] **Step 2: Run it**

```bash
.venv/bin/pytest tests/test_adapter_contract.py -v
```

Expected: 6 passed (3 existing × 2 = 6 with the new parameterized test, depending on count).

- [ ] **Step 3: Commit**

```bash
git add tests/test_adapter_contract.py
git commit -m "test(adapters): assert every param has a valid group"
```

---

## Task 8: Frontend — `ParamSpec` type + Basic/Advanced disclosure

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/components/ParamsPanel.tsx`
- Modify: `web/src/test/ParamsPanel.test.tsx`

- [ ] **Step 1: Add `group` to the frontend `ParamSpec` type**

In `web/src/lib/api.ts`, change the `ParamSpec` type:

```ts
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
  group?: "basic" | "advanced";
};
```

- [ ] **Step 2: Extend `web/src/test/ParamsPanel.test.tsx`**

Append a new `describe` block with two tests:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParamsPanel from "@/components/ParamsPanel";
import type { ParamSpec } from "@/lib/api";

const specsMixed: ParamSpec[] = [
  { name: "temperature", label: "Temperature", type: "float", default: 0.8, min: 0.1, max: 1.5, step: 0.05, group: "basic" },
  { name: "seed", label: "Seed", type: "int", default: -1, min: -1, step: 1, group: "advanced" },
  { name: "top_p", label: "Top p", type: "float", default: 1.0, min: 0, max: 1, step: 0.01, group: "advanced" },
];

describe("ParamsPanel groups", () => {
  it("renders basic params and a closed advanced disclosure by default", () => {
    render(<ParamsPanel specs={specsMixed} values={{}} onChange={() => {}} />);
    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
    // advanced is in the DOM but not visible until <details> opens
    const seed = screen.getByLabelText(/^seed$/i) as HTMLInputElement;
    const detailsAncestor = seed.closest("details");
    expect(detailsAncestor).not.toBeNull();
    expect(detailsAncestor!.open).toBe(false);
  });

  it("opens disclosure on summary click and shows advanced params", () => {
    render(<ParamsPanel specs={specsMixed} values={{}} onChange={() => {}} />);
    const summary = screen.getByText(/advanced/i);
    fireEvent.click(summary);
    const seed = screen.getByLabelText(/^seed$/i) as HTMLInputElement;
    expect(seed.closest("details")!.open).toBe(true);
  });

  it("propagates onChange from advanced params", () => {
    const onChange = vi.fn();
    render(<ParamsPanel specs={specsMixed} values={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText(/advanced/i));
    fireEvent.change(screen.getByLabelText(/^top p$/i), { target: { value: "0.6" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ top_p: 0.6 }));
  });
});
```

- [ ] **Step 3: Run the frontend tests to see them fail**

```bash
cd web && npm run test -- ParamsPanel
```

Expected: failures — ParamsPanel currently flat-renders all params with no disclosure.

- [ ] **Step 4: Refactor `web/src/components/ParamsPanel.tsx`**

Replace the file body with:

```tsx
import type { ParamSpec } from "@/lib/api";

type Props = {
  specs: ParamSpec[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

function renderControl(
  s: ParamSpec,
  values: Record<string, unknown>,
  set: (name: string, v: unknown) => void,
) {
  const id = `param-${s.name}`;
  const current: unknown = values[s.name] ?? s.default;
  if (s.type === "float" || s.type === "int") {
    const n = typeof current === "number" ? current : Number(current);
    return (
      <div key={s.name} className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor={id} className="label-mono">{s.label}</label>
          <span className="font-mono text-[12px] text-foreground tracking-wider">
            {Number.isFinite(n) ? n.toFixed(2) : String(current)}
          </span>
        </div>
        <input
          id={id}
          aria-label={s.label}
          type="range"
          min={s.min}
          max={s.max}
          step={s.step ?? 0.01}
          value={Number.isFinite(n) ? n : 0}
          onChange={(e) => set(s.name, Number(e.target.value))}
          className="w-full accent-[hsl(var(--ember))]"
        />
        {s.help && (
          <p className="text-[11px] text-muted-foreground/80 italic">{s.help}</p>
        )}
      </div>
    );
  }
  if (s.type === "bool") {
    return (
      <label
        key={s.name}
        htmlFor={id}
        className="flex items-center justify-between cursor-pointer"
      >
        <span className="label-mono">{s.label}</span>
        <input
          id={id}
          aria-label={s.label}
          type="checkbox"
          checked={!!current}
          onChange={(e) => set(s.name, e.target.checked)}
          className="accent-[hsl(var(--ember))]"
        />
      </label>
    );
  }
  return (
    <div key={s.name} className="space-y-1.5">
      <label htmlFor={id} className="label-mono block">{s.label}</label>
      <select
        id={id}
        aria-label={s.label}
        value={String(current)}
        onChange={(e) => set(s.name, e.target.value)}
        className="field-input font-mono text-[12px]"
      >
        {(s.choices ?? []).map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

export default function ParamsPanel({ specs, values, onChange }: Props) {
  function set(name: string, v: unknown) {
    onChange({ ...values, [name]: v });
  }
  const basic = specs.filter((s) => (s.group ?? "basic") === "basic");
  const advanced = specs.filter((s) => s.group === "advanced");
  return (
    <div className="space-y-5">
      {basic.map((s) => renderControl(s, values, set))}
      {advanced.length > 0 && (
        <details className="card-paper p-3 [&_summary::-webkit-details-marker]:hidden">
          <summary className="label-mono cursor-pointer select-none flex items-center gap-2">
            <span className="inline-block transition-transform [details[open]>summary>&]:rotate-90">▸</span>
            advanced · {advanced.length} params
          </summary>
          <div className="mt-4 space-y-5">
            {advanced.map((s) => renderControl(s, values, set))}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the frontend tests**

```bash
cd web && npm run test -- ParamsPanel
```

Expected: 5 passed (2 existing + 3 new).

- [ ] **Step 6: Verify production build still succeeds**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd ..
git add web/src/lib/api.ts web/src/components/ParamsPanel.tsx web/src/test/ParamsPanel.test.tsx
git commit -m "feat(web): ParamsPanel splits params into basic + advanced disclosure"
```

---

## Task 9: Frontend — special seed control inside `ParamsPanel`

**Files:**
- Modify: `web/src/components/ParamsPanel.tsx`
- Modify: `web/src/test/ParamsPanel.test.tsx`

- [ ] **Step 1: Append two new tests to `web/src/test/ParamsPanel.test.tsx`**

```tsx
describe("ParamsPanel seed control", () => {
  it("renders an int input plus a randomize button for seed", () => {
    const specs: ParamSpec[] = [
      { name: "seed", label: "Seed", type: "int", default: -1, min: -1, step: 1, group: "advanced" },
    ];
    render(<ParamsPanel specs={specs} values={{}} onChange={() => {}} />);
    fireEvent.click(screen.getByText(/advanced/i));
    expect(screen.getByLabelText(/^seed$/i)).toHaveAttribute("type", "number");
    expect(screen.getByRole("button", { name: /random/i })).toBeInTheDocument();
  });

  it("clicking randomize sets seed to -1 via onChange", () => {
    const specs: ParamSpec[] = [
      { name: "seed", label: "Seed", type: "int", default: -1, min: -1, step: 1, group: "advanced" },
    ];
    const onChange = vi.fn();
    render(<ParamsPanel specs={specs} values={{ seed: 42 }} onChange={onChange} />);
    fireEvent.click(screen.getByText(/advanced/i));
    fireEvent.click(screen.getByRole("button", { name: /random/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ seed: -1 }));
  });
});
```

- [ ] **Step 2: Add a special-case to `renderControl` in `ParamsPanel.tsx`**

In `web/src/components/ParamsPanel.tsx`, near the top of `renderControl`, before the existing `if (s.type === "float" || s.type === "int")` branch, add:

```tsx
  if (s.name === "seed") {
    const v = (values[s.name] ?? s.default) as number;
    return (
      <div key={s.name} className="space-y-1.5">
        <label htmlFor={id} className="label-mono">{s.label}</label>
        <div className="flex items-center gap-3">
          <input
            id={id}
            aria-label={s.label}
            type="number"
            min={s.min}
            step={s.step ?? 1}
            value={v}
            onChange={(e) => set(s.name, Number(e.target.value))}
            className="field-input !w-44 font-mono text-[12px] py-1"
          />
          <button
            type="button"
            onClick={() => set(s.name, -1)}
            className="label-mono hover:text-foreground transition-colors"
          >
            ↻ random
          </button>
          {v === -1 && (
            <span className="label-mono text-muted-foreground">(random per generate)</span>
          )}
        </div>
        {s.help && (
          <p className="text-[11px] text-muted-foreground/80 italic">{s.help}</p>
        )}
      </div>
    );
  }
```

- [ ] **Step 3: Run frontend tests**

```bash
cd web && npm run test -- ParamsPanel
```

Expected: 7 passed (2 + 3 + 2).

- [ ] **Step 4: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/components/ParamsPanel.tsx web/src/test/ParamsPanel.test.tsx
git commit -m "feat(web): seed control with -1=random + randomize button"
```

---

## Task 10: Frontend — IndexedDB v2 migration + `seedUsed` display + reuse button

**Files:**
- Modify: `web/src/lib/idb.ts`
- Modify: `web/src/test/idb.test.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/components/HistoryList.tsx`

- [ ] **Step 1: Extend tests in `web/src/test/idb.test.ts`**

Append:

```ts
describe("history v2", () => {
  it("stores seedUsed and kind on a row", async () => {
    const id = await addHistory({
      text: "x",
      modelId: "m",
      voiceId: undefined,
      language: undefined,
      params: {},
      audioBlob: new Blob([""]),
      kind: "single",
      seedUsed: 12345,
    });
    const items = await listHistory();
    const item = items.find((h) => h.id === id)!;
    expect(item.seedUsed).toBe(12345);
    expect(item.kind).toBe("single");
  });

  it("stores speakers list on a dialog row", async () => {
    const id = await addHistory({
      text: "SPEAKER A: hi",
      modelId: "m",
      voiceId: undefined,
      language: undefined,
      params: {},
      audioBlob: new Blob([""]),
      kind: "dialog",
      seedUsed: 7,
      speakers: [
        { letter: "A", voiceId: 1 },
        { letter: "B", voiceId: 2 },
      ],
    });
    const items = await listHistory();
    const item = items.find((h) => h.id === id)!;
    expect(item.speakers).toEqual([
      { letter: "A", voiceId: 1 },
      { letter: "B", voiceId: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
cd web && npm run test -- idb
```

Expected: failures — `addHistory` doesn't accept those keys.

- [ ] **Step 3: Update `web/src/lib/idb.ts`**

Replace the `HistoryRecord` type and the `DB` class block with:

```ts
export type SpeakerRef = { letter: "A" | "B" | "C" | "D"; voiceId: number };

export type HistoryRecord = {
  id?: number;
  text: string;
  modelId: string;
  voiceId?: number;
  language?: string;
  params: Record<string, unknown>;
  audioBlob: Blob;
  createdAt: number;
  kind?: "single" | "dialog";
  seedUsed?: number;
  speakers?: SpeakerRef[];
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
    this.version(2).stores({
      voices: "++id, name, createdAt, isFavorite",
      history: "++id, createdAt",
    }).upgrade(async (tx) => {
      // Backfill new fields on existing rows so listings stay consistent.
      await tx.table("history").toCollection().modify((r: HistoryRecord) => {
        if (!r.kind) r.kind = "single";
      });
    });
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
cd web && npm run test -- idb
```

Expected: all green (existing + 2 new).

- [ ] **Step 5: Read `X-Seed-Used` from the response in `lib/api.ts`**

Replace the `generate` function:

```ts
export type GenerateResult = {
  blob: Blob;
  seedUsed: number | null;
};

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const fd = new FormData();
  fd.set("text", input.text);
  fd.set("model_id", input.modelId);
  fd.set("params", JSON.stringify(input.params ?? {}));
  if (input.language) fd.set("language", input.language);
  if (input.reference) fd.set("reference_wav", input.reference, "ref.wav");
  const r = await fetch("/api/generate", { method: "POST", body: fd });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const code = err?.error?.code ?? `generate: ${r.status}`;
    const msg = err?.error?.message;
    throw new Error(msg ? `${code}: ${msg}` : code);
  }
  const seedHeader = r.headers.get("x-seed-used");
  const seedUsed = seedHeader != null ? Number(seedHeader) : null;
  const blob = await r.blob();
  return { blob, seedUsed };
}
```

- [ ] **Step 6: Update the api test that exercises `generate`**

Replace the existing `it("generate posts multipart and returns response blob", ...)` body in `web/src/test/api.test.ts` with:

```ts
  it("generate posts multipart and returns response blob with seed", async () => {
    fetchMock.mockResolvedValue(
      new Response("RIFFFAKE", {
        status: 200,
        headers: { "X-Seed-Used": "777" },
      }),
    );
    const out = await generate({ modelId: "x", text: "hi", params: {} });
    expect(typeof out.blob.size).toBe("number");
    expect(out.seedUsed).toBe(777);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
  });
```

- [ ] **Step 7: Update `Studio.tsx` callers of `generate(...)` to read the new return shape**

In `web/src/pages/Studio.tsx`, replace the lines around `setOutputUrl` / `addHistory`:

```tsx
      const result = await generate({
        modelId: active.id,
        text: inputText,
        language: inputLang,
        params: inputParams,
        reference: refBlob,
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(result.blob);
      });
      await addHistory({
        text: inputText,
        modelId: active.id,
        voiceId: selectedVoice?.id,
        language: inputLang,
        params: inputParams,
        audioBlob: result.blob,
        kind: "single",
        seedUsed: result.seedUsed ?? undefined,
      });
```

- [ ] **Step 8: Update `HistoryList.tsx` to show seed and a reuse button**

Replace the file body with:

```tsx
import { useEffect, useState } from "react";
import { listHistory, type HistoryRecord } from "@/lib/idb";

type Props = {
  refreshKey?: number;
  onRegenerate: (h: HistoryRecord) => void;
  onReuseSeed?: (seed: number) => void;
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryList({ refreshKey, onRegenerate, onReuseSeed }: Props) {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    listHistory().then(setItems);
  }, [refreshKey]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Generations will be archived here.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((h, i) => {
        const url = URL.createObjectURL(h.audioBlob);
        const kindLabel =
          h.kind === "dialog"
            ? `dialog · ${(h.speakers ?? []).length} spk · ${h.modelId.replace("chatterbox-", "")}`
            : `${h.modelId.replace("chatterbox-", "")} · ${h.language ?? "—"}`;
        return (
          <li key={h.id} className="card-paper p-3 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="marker-num">
                {String(items.length - i).padStart(2, "0")}
              </span>
              <span className="label-mono">{kindLabel} · {fmtTime(h.createdAt)}</span>
            </div>
            <p className="text-[13px] leading-snug line-clamp-3">{h.text}</p>
            <audio controls src={url} className="w-full h-9" />
            <div className="flex items-center justify-between">
              {h.seedUsed != null ? (
                <button
                  type="button"
                  onClick={() => onReuseSeed?.(h.seedUsed!)}
                  className="label-mono hover:text-[hsl(var(--ember))] transition-colors"
                  title="Copy this seed into the active params"
                >
                  seed {h.seedUsed} · ↻
                </button>
              ) : (
                <span className="label-mono text-muted-foreground/60">no seed</span>
              )}
              <div className="flex gap-3">
                <a
                  href={url}
                  download={`${h.id}.wav`}
                  className="label-mono hover:text-foreground transition-colors"
                >
                  ↓ download
                </a>
                <button
                  type="button"
                  className="label-mono hover:text-[hsl(var(--ember))] transition-colors"
                  onClick={() => onRegenerate(h)}
                >
                  ↻ regenerate
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 9: Pass an `onReuseSeed` from `Studio.tsx` to `HistoryList`**

In `web/src/pages/Studio.tsx`, find the `<HistoryList .../>` render and update it to:

```tsx
<HistoryList
  refreshKey={historyKey}
  onRegenerate={onGenerate}
  onReuseSeed={(seed) => setParams((p) => ({ ...p, seed }))}
/>
```

- [ ] **Step 10: Run all frontend tests + build**

```bash
cd web && npm run test
cd web && npm run build
```

Expected: all tests green; build succeeds.

- [ ] **Step 11: Commit**

```bash
cd ..
git add web/src/lib/idb.ts web/src/lib/api.ts web/src/components/HistoryList.tsx web/src/pages/Studio.tsx web/src/test/idb.test.ts web/src/test/api.test.ts
git commit -m "feat(web): IndexedDB v2 migration; show seed and reuse button on history rows"
```

---

## Task 11: Backend — Dialog parser

**Files:**
- Create: `server/dialog.py` (parser only — generator is added in Task 12)
- Test: `tests/test_dialog_parser.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_dialog_parser.py`:

```python
import pytest

from server.dialog import DialogParseError, DialogTurn, parse_dialog


def test_simple_a_b_alternation():
    text = "SPEAKER A: hi\nSPEAKER B: hello"
    turns = parse_dialog(text)
    assert turns == [
        DialogTurn(speaker="A", text="hi"),
        DialogTurn(speaker="B", text="hello"),
    ]


def test_multi_line_turn():
    text = "SPEAKER A: line one\nstill A\nSPEAKER B: end."
    turns = parse_dialog(text)
    assert turns[0].speaker == "A"
    assert turns[0].text == "line one\nstill A"
    assert turns[1].speaker == "B"
    assert turns[1].text == "end."


def test_leading_whitespace_tolerated():
    text = "   SPEAKER A: hi\n   SPEAKER B: hello"
    turns = parse_dialog(text)
    assert [t.speaker for t in turns] == ["A", "B"]


def test_missing_prefix_raises():
    with pytest.raises(DialogParseError):
        parse_dialog("plain text with no speakers")


def test_unknown_letter_is_ignored_so_no_match_raises():
    # "SPEAKER E: ..." doesn't match the regex -> treated as no tags.
    with pytest.raises(DialogParseError):
        parse_dialog("SPEAKER E: nope")


def test_three_consecutive_a_turns():
    text = "SPEAKER A: one\nSPEAKER A: two\nSPEAKER A: three"
    turns = parse_dialog(text)
    assert [t.text for t in turns] == ["one", "two", "three"]


def test_empty_turn_is_dropped():
    text = "SPEAKER A: hi\nSPEAKER B:\nSPEAKER C: bye"
    turns = parse_dialog(text)
    assert [t.speaker for t in turns] == ["A", "C"]
```

- [ ] **Step 2: Run them to verify failure**

```bash
.venv/bin/pytest tests/test_dialog_parser.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Write `server/dialog.py` (parser only — generator added in Task 12)**

`server/dialog.py`:

```python
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
```

- [ ] **Step 4: Run the tests**

```bash
.venv/bin/pytest tests/test_dialog_parser.py -v
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add server/dialog.py tests/test_dialog_parser.py
git commit -m "feat(dialog): parse_dialog with SPEAKER A-D regex and edge-case handling"
```

---

## Task 12: Backend — Dialog generator + `/api/generate/dialog` endpoint

**Files:**
- Modify: `server/dialog.py`
- Modify: `server/main.py`
- Test: `tests/test_dialog_endpoint.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_dialog_endpoint.py`:

```python
import io

import httpx
import numpy as np
import pytest
import soundfile as sf

from server.main import build_app


pytestmark = pytest.mark.asyncio


def _silent_wav(seconds: float = 1.0, sr: int = 24000) -> bytes:
    samples = np.zeros(int(seconds * sr), dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


async def test_dialog_generates_concatenated_wav(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    # Have FakeAdapter emit a real silent WAV so the dialog generator can decode it.
    fake_classes["fake"].generate = lambda self, text, ref, lang, p: (
        _silent_wav(0.2),
        24000,
        0,
    )
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        files = {
            "reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav"),
            "reference_wav_b": ("b.wav", _silent_wav(1.0), "audio/wav"),
        }
        r = await c.post(
            "/api/generate/dialog",
            data={
                "text": "SPEAKER A: hi\nSPEAKER B: hello",
                "engine_id": "fake",
                "params": "{}",
            },
            files=files,
        )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/wav")
    assert r.content[:4] == b"RIFF"
    assert r.headers["x-seed-used"] == "0"


async def test_dialog_format_invalid(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate/dialog",
            data={"text": "no speaker tags", "engine_id": "fake", "params": "{}"},
            files={
                "reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav"),
            },
        )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "dialog_format_invalid"


async def test_dialog_missing_reference(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    fake_classes["fake"].generate = lambda self, text, ref, lang, p: (
        _silent_wav(0.2),
        24000,
        0,
    )
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate/dialog",
            data={
                "text": "SPEAKER A: hi\nSPEAKER B: hello",
                "engine_id": "fake",
                "params": "{}",
            },
            files={"reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav")},
        )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "dialog_missing_reference"


async def test_dialog_unknown_engine_404(monkeypatch, fake_classes):
    monkeypatch.setattr("server.main._discover_adapter_classes", lambda: fake_classes)
    monkeypatch.setattr("server.main.select_device", lambda: "cpu")
    app = build_app()
    from tests.conftest import lifespan_ctx
    transport = httpx.ASGITransport(app=app)
    async with lifespan_ctx(app), httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.post(
            "/api/generate/dialog",
            data={
                "text": "SPEAKER A: hi",
                "engine_id": "nope",
                "params": "{}",
            },
            files={"reference_wav_a": ("a.wav", _silent_wav(1.0), "audio/wav")},
        )
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"
```

- [ ] **Step 2: Run them to verify failure**

```bash
.venv/bin/pytest tests/test_dialog_endpoint.py -v
```

Expected: 404s — endpoint doesn't exist yet.

- [ ] **Step 3: Add the generator to `server/dialog.py`**

Append to `server/dialog.py`:

```python
import io as _io
import tempfile as _tempfile
from typing import Optional

import numpy as _np
import soundfile as _sf

from server.audio import AudioValidationError, validate_reference_clip, write_wav_bytes
from server.registry import Registry
from server.seed import apply_seed


SILENCE_GAP_MS = 250


class DialogReferenceError(ValueError):
    """Raised when a turn references a speaker without an uploaded clip."""


def _decode_wav_to_mono_float(wav_bytes: bytes) -> tuple[_np.ndarray, int]:
    arr, sr = _sf.read(_io.BytesIO(wav_bytes), dtype="float32", always_2d=False)
    if arr.ndim == 2:
        arr = arr.mean(axis=1)
    return arr.astype(_np.float32), int(sr)


def _save_temp_wav(data: bytes) -> str:
    tmp = _tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.write(data)
    tmp.flush()
    tmp.close()
    return tmp.name


async def generate_dialog(
    *,
    registry: Registry,
    engine_id: str,
    text: str,
    language: Optional[str],
    params: dict,
    speaker_clips: dict[str, bytes],   # letter -> raw upload bytes (already validated)
    silence_ms: int = SILENCE_GAP_MS,
) -> tuple[bytes, int, int]:
    turns = parse_dialog(text)

    # Verify every referenced speaker has a clip.
    referenced = {t.speaker for t in turns}
    missing = referenced - set(speaker_clips.keys())
    if missing:
        raise DialogReferenceError(
            f"missing reference for speaker {sorted(missing)[0]}"
        )

    # Persist each clip to a tempfile path once (the adapter expects a path).
    paths: dict[str, str] = {
        letter: _save_temp_wav(blob) for letter, blob in speaker_clips.items()
    }

    adapter = await registry.get_or_load(engine_id)

    # Resolve and re-apply one seed for the whole dialog.
    seed_used = apply_seed(params.get("seed"))
    params_for_call = {**params, "seed": seed_used}

    sr_out: int | None = None
    chunks: list[_np.ndarray] = []
    for turn in turns:
        # Re-apply the same seed before each turn so the run is reproducible.
        apply_seed(seed_used)
        wav_bytes, sr, _ = adapter.generate(
            turn.text, paths[turn.speaker], language, params_for_call,
        )
        arr, _ = _decode_wav_to_mono_float(wav_bytes)
        chunks.append(arr)
        if sr_out is None:
            sr_out = sr
        if silence_ms > 0:
            chunks.append(_np.zeros(int(silence_ms * sr / 1000), dtype=_np.float32))

    assert sr_out is not None
    full = _np.concatenate(chunks) if chunks else _np.zeros(0, dtype=_np.float32)
    out = write_wav_bytes(full, sr_out)
    return out, sr_out, seed_used
```

- [ ] **Step 4: Add the `/api/generate/dialog` route to `server/main.py`**

In `server/main.py`, add the import at the top:

```python
from server.dialog import (
    DialogParseError,
    DialogReferenceError,
    generate_dialog,
)
```

Inside `build_app()`, after the existing `/api/generate` route, insert:

```python
    @app.post("/api/generate/dialog")
    async def generate_dialog_route(
        text: str = Form(...),
        engine_id: str = Form(...),
        params: str = Form("{}"),
        language: str | None = Form(None),
        reference_wav_a: UploadFile | None = File(None),
        reference_wav_b: UploadFile | None = File(None),
        reference_wav_c: UploadFile | None = File(None),
        reference_wav_d: UploadFile | None = File(None),
    ):
        speaker_clips: dict[str, bytes] = {}
        upload_map = {
            "A": reference_wav_a,
            "B": reference_wav_b,
            "C": reference_wav_c,
            "D": reference_wav_d,
        }
        for letter, upload in upload_map.items():
            if upload is None:
                continue
            data = await upload.read()
            try:
                validate_reference_clip(data)
            except AudioValidationError as exc:
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "code": "reference_invalid",
                            "message": f"speaker {letter}: {exc}",
                        }
                    },
                )
            speaker_clips[letter] = data

        try:
            wav_bytes, _sr, seed_used = await generate_dialog(
                registry=app.state.registry,
                engine_id=engine_id,
                text=text,
                language=language,
                params=json.loads(params or "{}"),
                speaker_clips=speaker_clips,
            )
        except KeyError:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "model_not_found", "message": engine_id}},
            )
        except DialogParseError as exc:
            return JSONResponse(
                status_code=400,
                content={
                    "error": {"code": "dialog_format_invalid", "message": str(exc)}
                },
            )
        except DialogReferenceError as exc:
            return JSONResponse(
                status_code=400,
                content={
                    "error": {"code": "dialog_missing_reference", "message": str(exc)}
                },
            )
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={
                    "error": {"code": "generation_failed", "message": str(exc)}
                },
            )
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-Seed-Used": str(seed_used),
                "Access-Control-Expose-Headers": "X-Seed-Used",
            },
        )
```

- [ ] **Step 5: Run the dialog endpoint tests**

```bash
.venv/bin/pytest tests/test_dialog_endpoint.py -v
```

Expected: 4 passed.

- [ ] **Step 6: Run the full backend suite to make sure nothing else regressed**

```bash
.venv/bin/pytest -q
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/dialog.py server/main.py tests/test_dialog_endpoint.py
git commit -m "feat(dialog): /api/generate/dialog endpoint + per-turn dispatcher with seed reuse"
```

---

## Task 13: Frontend — `generateDialog` API client

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/test/api.test.ts`

- [ ] **Step 1: Append a test for `generateDialog`**

In `web/src/test/api.test.ts`, append:

```ts
import { generateDialog } from "@/lib/api";

describe("generateDialog", () => {
  it("posts multipart with engine_id and per-speaker clips", async () => {
    fetchMock.mockResolvedValue(
      new Response("RIFFOK", {
        status: 200,
        headers: { "X-Seed-Used": "33" },
      }),
    );
    const out = await generateDialog({
      engineId: "x",
      text: "SPEAKER A: hi\nSPEAKER B: hi",
      params: { temperature: 0.8 },
      speakers: [
        { letter: "A", reference: new Blob(["a"], { type: "audio/wav" }) },
        { letter: "B", reference: new Blob(["b"], { type: "audio/wav" }) },
      ],
    });
    expect(out.seedUsed).toBe(33);
    expect(typeof out.blob.size).toBe("number");
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("/api/generate/dialog");
    const body = call[1].body as FormData;
    expect(body.get("engine_id")).toBe("x");
    expect(body.get("text")).toContain("SPEAKER A:");
    expect(body.get("reference_wav_a")).toBeInstanceOf(Blob);
    expect(body.get("reference_wav_b")).toBeInstanceOf(Blob);
  });

  it("forwards language only when provided", async () => {
    fetchMock.mockResolvedValue(new Response("RIFF", { status: 200 }));
    await generateDialog({
      engineId: "x",
      text: "SPEAKER A: hi",
      language: "fr",
      params: {},
      speakers: [{ letter: "A", reference: new Blob(["a"]) }],
    });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("language")).toBe("fr");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
cd web && npm run test -- api
```

Expected: failure — `generateDialog` not exported.

- [ ] **Step 3: Add `generateDialog` to `web/src/lib/api.ts`**

Append at the bottom of `web/src/lib/api.ts`:

```ts
export type DialogSpeakerInput = {
  letter: "A" | "B" | "C" | "D";
  reference: Blob;
};

export type DialogInput = {
  engineId: string;
  text: string;
  language?: string;
  params: Record<string, unknown>;
  speakers: DialogSpeakerInput[];
};

export type DialogResult = {
  blob: Blob;
  seedUsed: number | null;
};

export async function generateDialog(input: DialogInput): Promise<DialogResult> {
  const fd = new FormData();
  fd.set("text", input.text);
  fd.set("engine_id", input.engineId);
  fd.set("params", JSON.stringify(input.params ?? {}));
  if (input.language) fd.set("language", input.language);
  for (const s of input.speakers) {
    fd.set(`reference_wav_${s.letter.toLowerCase()}`, s.reference, `${s.letter}.wav`);
  }
  const r = await fetch("/api/generate/dialog", { method: "POST", body: fd });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const code = err?.error?.code ?? `dialog: ${r.status}`;
    const msg = err?.error?.message;
    throw new Error(msg ? `${code}: ${msg}` : code);
  }
  const seedHeader = r.headers.get("x-seed-used");
  const seedUsed = seedHeader != null ? Number(seedHeader) : null;
  const blob = await r.blob();
  return { blob, seedUsed };
}
```

- [ ] **Step 4: Run the tests + build**

```bash
cd web && npm run test -- api
cd web && npm run build
```

Expected: green; build succeeds.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/lib/api.ts web/src/test/api.test.ts
git commit -m "feat(web): generateDialog client with per-speaker multipart"
```

---

## Task 14: Frontend — `ModeToggle` and `SpeakerSlot`

**Files:**
- Create: `web/src/components/ModeToggle.tsx`
- Create: `web/src/components/SpeakerSlot.tsx`

- [ ] **Step 1: Implement `ModeToggle.tsx`**

`web/src/components/ModeToggle.tsx`:

```tsx
import { cn } from "@/lib/utils";

export type Mode = "single" | "dialog";

type Props = {
  mode: Mode;
  onChange: (m: Mode) => void;
};

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "Single voice" },
  { id: "dialog", label: "Dialog" },
];

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Generation mode"
      className="inline-flex rounded-sm border border-border overflow-hidden"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={cn(
            "label-mono px-3 py-1.5 transition-colors",
            mode === m.id
              ? "bg-[hsl(var(--ember))]/15 text-[hsl(var(--ember))]"
              : "hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `SpeakerSlot.tsx`**

`web/src/components/SpeakerSlot.tsx`:

```tsx
import { useEffect, useState } from "react";
import { listVoices, type VoiceRecord } from "@/lib/idb";

type Props = {
  letter: "A" | "B" | "C" | "D";
  voice?: VoiceRecord;
  onChange: (v: VoiceRecord | undefined) => void;
  onRemove?: () => void;
  refreshKey?: number;
};

export default function SpeakerSlot({ letter, voice, onChange, onRemove, refreshKey }: Props) {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  useEffect(() => {
    listVoices().then(setVoices);
  }, [refreshKey]);

  return (
    <div className="flex items-center gap-3">
      <span className="display-serif text-[20px] w-7">{letter}</span>
      <select
        aria-label={`Speaker ${letter} voice`}
        value={voice?.id ?? ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          onChange(voices.find((v) => v.id === id));
        }}
        className="field-input flex-1 font-mono text-[12px] py-1"
      >
        <option value="" disabled>pick voice…</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove speaker ${letter}`}
          className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the project still builds**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ..
git add web/src/components/ModeToggle.tsx web/src/components/SpeakerSlot.tsx
git commit -m "feat(web): ModeToggle (Single/Dialog) and SpeakerSlot components"
```

---

## Task 15: Frontend — `DialogComposer`

**Files:**
- Create: `web/src/components/DialogComposer.tsx`
- Test: `web/src/test/DialogComposer.test.tsx`

- [ ] **Step 1: Write the failing test**

`web/src/test/DialogComposer.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DialogComposer from "@/components/DialogComposer";
import type { ModelInfo } from "@/lib/api";

const models: ModelInfo[] = [
  {
    id: "chatterbox-en",
    label: "Chatterbox (English)",
    description: "",
    languages: [{ code: "en", label: "English" }],
    paralinguistic_tags: [],
    supports_voice_clone: true,
    params: [
      { name: "temperature", label: "Temperature", type: "float", default: 0.8, min: 0.1, max: 1.5, step: 0.05, group: "basic" },
    ],
  },
  {
    id: "chatterbox-mtl",
    label: "Chatterbox Multilingual",
    description: "",
    languages: [
      { code: "en", label: "English" },
      { code: "fr", label: "French" },
    ],
    paralinguistic_tags: [],
    supports_voice_clone: true,
    params: [
      { name: "exaggeration", label: "Exaggeration", type: "float", default: 0.5, min: 0, max: 2, step: 0.05, group: "basic" },
    ],
  },
];

describe("DialogComposer", () => {
  it("starts with two speaker slots A and B", () => {
    render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    expect(screen.getByLabelText(/speaker a voice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/speaker b voice/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/speaker c voice/i)).toBeNull();
  });

  it("adds speaker C when + add speaker is clicked", () => {
    render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add speaker/i }));
    expect(screen.getByLabelText(/speaker c voice/i)).toBeInTheDocument();
  });

  it("does not allow more than 4 speakers", () => {
    render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add speaker/i })); // C
    fireEvent.click(screen.getByRole("button", { name: /add speaker/i })); // D
    expect(screen.queryByRole("button", { name: /add speaker/i })).toBeNull();
  });

  it("renders the language picker only when mtl engine is active", () => {
    const { rerender } = render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    expect(screen.queryByLabelText(/^language$/i)).toBeNull();

    rerender(
      <DialogComposer
        models={models}
        engineId="chatterbox-mtl"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    expect(screen.getByLabelText(/^language$/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

```bash
cd web && npm run test -- DialogComposer
```

Expected: failure — component doesn't exist.

- [ ] **Step 3: Implement `DialogComposer.tsx`**

`web/src/components/DialogComposer.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "@/lib/api";
import { type VoiceRecord } from "@/lib/idb";
import ParamsPanel from "@/components/ParamsPanel";
import SpeakerSlot from "@/components/SpeakerSlot";
import TagBar from "@/components/TagBar";

export type DialogSubmit = {
  text: string;
  engineId: string;
  language?: string;
  params: Record<string, unknown>;
  speakers: { letter: "A" | "B" | "C" | "D"; voice: VoiceRecord }[];
};

type Props = {
  models: ModelInfo[];
  engineId: string;
  onEngineChange: (id: string) => void;
  onSubmit: (input: DialogSubmit) => void;
  loadingModel: boolean;
  busy: boolean;
  libraryRefreshKey?: number;
};

const ALL_LETTERS = ["A", "B", "C", "D"] as const;

export default function DialogComposer({
  models,
  engineId,
  onEngineChange,
  onSubmit,
  loadingModel,
  busy,
  libraryRefreshKey,
}: Props) {
  const [count, setCount] = useState(2);
  const [speakers, setSpeakers] = useState<Record<string, VoiceRecord | undefined>>({});
  const [text, setText] = useState("SPEAKER A: \nSPEAKER B: \n");
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const textRef = useRef<HTMLTextAreaElement>(null);

  const engine = useMemo(() => models.find((m) => m.id === engineId), [models, engineId]);

  useEffect(() => {
    setParams(
      Object.fromEntries((engine?.params ?? []).map((p) => [p.name, p.default])),
    );
    setLanguage(engine?.languages[0]?.code);
  }, [engine?.id]);

  function setSpeaker(letter: string, v: VoiceRecord | undefined) {
    setSpeakers((s) => ({ ...s, [letter]: v }));
  }

  function addSpeaker() {
    setCount((c) => Math.min(4, c + 1));
  }

  function removeSpeaker(letter: string) {
    setSpeakers((s) => ({ ...s, [letter]: undefined }));
    setCount((c) => Math.max(2, c - 1));
  }

  function insertPrefix(letter: string) {
    const el = textRef.current;
    if (!el) return;
    const tag = `SPEAKER ${letter}: `;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
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

  function handleSubmit() {
    if (!engine) return;
    const speakerList: DialogSubmit["speakers"] = [];
    for (let i = 0; i < count; i++) {
      const letter = ALL_LETTERS[i];
      const v = speakers[letter];
      if (v) speakerList.push({ letter, voice: v });
    }
    onSubmit({
      text,
      engineId: engine.id,
      language,
      params,
      speakers: speakerList,
    });
  }

  const visibleLetters = ALL_LETTERS.slice(0, count);
  const canSubmit = !!engine && !busy && !loadingModel && text.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="label-mono">Speakers</h3>
        <div className="space-y-2">
          {visibleLetters.map((letter) => (
            <SpeakerSlot
              key={letter}
              letter={letter}
              voice={speakers[letter]}
              onChange={(v) => setSpeaker(letter, v)}
              onRemove={count > 2 ? () => removeSpeaker(letter) : undefined}
              refreshKey={libraryRefreshKey}
            />
          ))}
        </div>
        {count < 4 && (
          <button
            type="button"
            onClick={addSpeaker}
            className="btn-ghost"
          >
            + add speaker
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="label-mono">Engine</h3>
        <div className="flex flex-col gap-1">
          {models.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="dialog-engine"
                checked={engineId === m.id}
                onChange={() => onEngineChange(m.id)}
                className="accent-[hsl(var(--ember))]"
              />
              {m.label}
            </label>
          ))}
        </div>
        {engine?.languages && engine.languages.length > 1 && (
          <div className="flex items-center gap-3 pt-2">
            <label htmlFor="dialog-lang" className="label-mono">Language</label>
            <select
              id="dialog-lang"
              value={language ?? ""}
              onChange={(e) => setLanguage(e.target.value)}
              className="field-input !w-auto font-mono text-[12px] py-1"
            >
              {engine.languages.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="label-mono">Script</h3>
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="field-input font-mono text-[13px] leading-relaxed"
          placeholder="SPEAKER A: ...&#10;SPEAKER B: ..."
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label-mono mr-1">insert</span>
            {visibleLetters.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => insertPrefix(letter)}
                className="font-mono text-[11px] px-2 py-0.5 rounded-sm border border-border text-muted-foreground hover:text-[hsl(var(--ember))] hover:border-[hsl(var(--ember))]/50 transition-colors"
              >
                SPEAKER {letter}:
              </button>
            ))}
          </div>
          <TagBar tags={engine?.paralinguistic_tags ?? []} targetRef={textRef} />
        </div>
      </div>

      {engine && (
        <div className="space-y-2">
          <h3 className="label-mono">Parameters</h3>
          <ParamsPanel specs={engine.params} values={params} onChange={setParams} />
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn-primary w-full flex items-center justify-center gap-3 ember-ring"
      >
        {busy ? (
          <>
            <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
            Generating dialog
          </>
        ) : (
          <>Generate dialog <span className="opacity-60">→</span></>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
cd web && npm run test -- DialogComposer
```

Expected: 4 passed.

- [ ] **Step 5: Build**

```bash
cd web && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd ..
git add web/src/components/DialogComposer.tsx web/src/test/DialogComposer.test.tsx
git commit -m "feat(web): DialogComposer — speaker slots, engine radio, script + params"
```

---

## Task 16: Frontend — Studio integration with mode toggle

**Files:**
- Modify: `web/src/pages/Studio.tsx`

This task wires the new `ModeToggle` and `DialogComposer` into the existing `Studio` page. The single-voice flow stays as-is; when mode is `dialog`, the left column renders `DialogComposer` and submitting calls `generateDialog`.

- [ ] **Step 1: Replace `web/src/pages/Studio.tsx` with the integrated version**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  activateModel,
  generate,
  generateDialog,
  getActiveModel,
  listModels,
  streamActiveEvents,
  type ModelInfo,
} from "@/lib/api";
import { addHistory, type HistoryRecord, type VoiceRecord } from "@/lib/idb";
import DeviceBadge from "@/components/DeviceBadge";
import DialogComposer, { type DialogSubmit } from "@/components/DialogComposer";
import HistoryList from "@/components/HistoryList";
import LoadingBanner from "@/components/LoadingBanner";
import ModelPicker from "@/components/ModelPicker";
import ModeToggle, { type Mode } from "@/components/ModeToggle";
import ParamsPanel from "@/components/ParamsPanel";
import TagBar from "@/components/TagBar";
import VoiceComposer from "@/components/VoiceComposer";
import VoiceLibrary from "@/components/VoiceLibrary";
import { cn } from "@/lib/utils";

function SectionHeader({ num, title, hint }: { num: string; title: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-3">
        <span className="marker-num">{num}</span>
        <h2 className="display-serif text-[22px] leading-tight">{title}</h2>
      </div>
      {hint && <p className="label-mono">{hint}</p>}
      <div className="rule-dotted mt-2" />
    </div>
  );
}

export default function Studio() {
  const [mode, setMode] = useState<Mode>("single");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogEngineId, setDialogEngineId] = useState<string>("chatterbox-en");
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
      if (m[0]) {
        setActiveId((cur) => cur ?? m[0].id);
        setDialogEngineId((cur) => cur || m[0].id);
      }
    });
    getActiveModel().then((s) => setActiveId((cur) => cur ?? s.id));
  }, []);

  useEffect(() => {
    const close = streamActiveEvents((evt) => {
      if (evt.status === "loading") setLoadingModel(true);
      if (evt.status === "loaded" || evt.status === "error") setLoadingModel(false);
      if (evt.status === "loaded" && evt.id) setActiveId(evt.id);
      if (evt.status === "error" && evt.error) setErr(evt.error);
    });
    return close;
  }, []);

  const active = useMemo(
    () => models.find((m) => m.id === activeId),
    [models, activeId],
  );

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
      const result = await generate({
        modelId: active.id,
        text: inputText,
        language: inputLang,
        params: inputParams,
        reference: refBlob,
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(result.blob);
      });
      await addHistory({
        text: inputText,
        modelId: active.id,
        voiceId: selectedVoice?.id,
        language: inputLang,
        params: inputParams,
        audioBlob: result.blob,
        kind: "single",
        seedUsed: result.seedUsed ?? undefined,
      });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDialogSubmit(input: DialogSubmit) {
    setErr(null);
    setBusy(true);
    try {
      const result = await generateDialog({
        engineId: input.engineId,
        text: input.text,
        language: input.language,
        params: input.params,
        speakers: input.speakers.map((s) => ({
          letter: s.letter,
          reference: s.voice.blob,
        })),
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(result.blob);
      });
      await addHistory({
        text: input.text,
        modelId: input.engineId,
        language: input.language,
        params: input.params,
        audioBlob: result.blob,
        kind: "dialog",
        seedUsed: result.seedUsed ?? undefined,
        speakers: input.speakers.map((s) => ({ letter: s.letter, voiceId: s.voice.id! })),
      });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative-z animate-fade-up">
      <header className="border-b border-border">
        <div className="mx-auto max-w-[1280px] px-8 py-5 flex items-end justify-between">
          <div className="flex items-end gap-4">
            <span className="display-serif text-[34px] leading-none">Chatterbox</span>
            <span className="label-mono pb-1">voice studio · v0.2</span>
          </div>
          <div className="flex items-center gap-6">
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === "single" && (
              <ModelPicker
                models={models}
                activeId={activeId}
                loading={loadingModel || busy}
                onPick={pickModel}
              />
            )}
            <DeviceBadge />
          </div>
        </div>
      </header>

      <LoadingBanner
        visible={loadingModel}
        message="Loading model — first activation can take 30–60s"
      />
      {err && (
        <div className="border-b border-red-900/40 bg-red-950/30 px-8 py-2.5">
          <span className="label-mono text-red-400">error</span>
          <span className="ml-3 text-sm text-red-300/90">{err}</span>
        </div>
      )}

      <main className="mx-auto max-w-[1280px] px-8 py-10 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-12">
        <section className="space-y-12">
          {mode === "single" ? (
            <>
              <div className="space-y-5">
                <SectionHeader num="01" title="Reference voice" hint="upload, record, or pick from your library" />
                <VoiceComposer onSaved={() => setLibraryKey((k) => k + 1)} />
                <VoiceLibrary
                  selectedId={selectedVoice?.id}
                  onSelect={setSelectedVoice}
                  refreshKey={libraryKey}
                />
              </div>

              <div className="space-y-4">
                <SectionHeader num="02" title="Script" hint="what should the voice say?" />
                {active?.languages && active.languages.length > 1 && (
                  <div className="flex items-center gap-3">
                    <label htmlFor="lang-select" className="label-mono">language</label>
                    <select
                      id="lang-select"
                      value={language ?? ""}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="field-input !w-auto font-mono text-[12px] py-1"
                    >
                      {active.languages.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <textarea
                  id="prompt"
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  className="field-input font-display text-[18px] leading-relaxed"
                  placeholder="Once upon a midnight dreary, while I pondered, weak and weary…"
                />
                <div className="flex items-center justify-between">
                  <TagBar tags={active?.paralinguistic_tags ?? []} targetRef={textRef} />
                  <span className="label-mono">{text.length} chars</span>
                </div>
              </div>

              {active && (
                <div className="space-y-5">
                  <SectionHeader num="03" title="Parameters" hint={active.description} />
                  <ParamsPanel specs={active.params} values={params} onChange={setParams} />
                </div>
              )}

              <div className="space-y-4 pt-2">
                <button
                  type="button"
                  onClick={() => onGenerate()}
                  disabled={busy || loadingModel || !text.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-3 ember-ring"
                >
                  {busy ? (
                    <>
                      <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
                      Generating
                    </>
                  ) : (
                    <>Generate <span className="opacity-60">→</span></>
                  )}
                </button>

                {outputUrl && (
                  <div className="card-paper p-4 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="label-mono">latest output</span>
                      <a href={outputUrl} download="chatterbox.wav" className="label-mono hover:text-foreground">
                        ↓ download
                      </a>
                    </div>
                    <audio controls src={outputUrl} className="w-full h-10" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <DialogComposer
              models={models}
              engineId={dialogEngineId}
              onEngineChange={setDialogEngineId}
              onSubmit={onDialogSubmit}
              loadingModel={loadingModel}
              busy={busy}
              libraryRefreshKey={libraryKey}
            />
          )}

          {mode === "dialog" && outputUrl && (
            <div className="card-paper p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="label-mono">latest output</span>
                <a href={outputUrl} download="dialog.wav" className="label-mono hover:text-foreground">
                  ↓ download
                </a>
              </div>
              <audio controls src={outputUrl} className="w-full h-10" />
            </div>
          )}
        </section>

        <aside className="space-y-5 lg:sticky lg:top-8 self-start">
          <div className="flex border-b border-border">
            {(["voices", "history"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 label-mono py-2 transition-colors border-b-2",
                  tab === t
                    ? "text-foreground border-[hsl(var(--ember))]"
                    : "border-transparent hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "voices" ? (
            <VoiceLibrary
              selectedId={selectedVoice?.id}
              onSelect={setSelectedVoice}
              refreshKey={libraryKey}
            />
          ) : (
            <HistoryList
              refreshKey={historyKey}
              onRegenerate={onGenerate}
              onReuseSeed={(seed) => setParams((p) => ({ ...p, seed }))}
            />
          )}
        </aside>
      </main>

      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-[1280px] px-8 py-6 flex items-center justify-between">
          <span className="label-mono">chatterbox · resemble ai</span>
          <span className="label-mono">stateless · browser-persisted</span>
        </div>
      </footer>
    </div>
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
git add web/src/pages/Studio.tsx
git commit -m "feat(web): Studio mode toggle wires DialogComposer + dialog generate flow"
```

---

## Task 17: Smoke script — extend with a Dialog step

**Files:**
- Modify: `scripts/smoke.sh`

- [ ] **Step 1: Extend `scripts/smoke.sh`**

Append to `scripts/smoke.sh` (after the existing `generate (1 sentence)` block):

```bash

echo
echo "== generate dialog (2 speakers, en)"
# Make a tiny silent reference clip (1s mono 24k WAV) for both speakers.
REF_A=$(mktemp -t smoke_a.XXXXXX.wav)
REF_B=$(mktemp -t smoke_b.XXXXXX.wav)
python - <<'PY' "$REF_A"
import sys, numpy as np, soundfile as sf
sf.write(sys.argv[1], np.zeros(24000, dtype="float32"), 24000, format="WAV", subtype="PCM_16")
PY
python - <<'PY' "$REF_B"
import sys, numpy as np, soundfile as sf
sf.write(sys.argv[1], np.zeros(24000, dtype="float32"), 24000, format="WAV", subtype="PCM_16")
PY

OUT=$(mktemp -t smoke_dialog.XXXXXX.wav)
curl -fsS -X POST "$BASE/api/generate/dialog" \
    -F text='SPEAKER A: hi.
SPEAKER B: hello.' \
    -F engine_id=chatterbox-en \
    -F params='{}' \
    -F reference_wav_a=@"$REF_A" \
    -F reference_wav_b=@"$REF_B" \
    -o "$OUT"
HEAD=$(head -c 4 "$OUT" | xxd -p)
if [ "$HEAD" != "52494646" ]; then
    echo "FAIL: dialog output is not a RIFF wav (head=$HEAD)"
    exit 1
fi
echo "OK — wrote $OUT ($(wc -c <"$OUT") bytes)"
```

- [ ] **Step 2: Make sure it's still executable**

```bash
chmod +x scripts/smoke.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.sh
git commit -m "chore(scripts): smoke.sh exercises /api/generate/dialog as well"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| §4.1 `ParamSpec.group` | Task 1 |
| §4.2 per-adapter param tables | Tasks 4 (en), 5 (turbo), 6 (mtl) |
| §4.3 `apply_seed` helper | Task 2 |
| §4.4 `X-Seed-Used` header + `seed_used` tuple | Task 3 |
| §4.5 dialog parser | Task 11 |
| §4.6 dialog generator | Task 12 |
| §4.7 `/api/generate/dialog` endpoint + errors | Task 12 |
| §4.8 `X-Seed-Used` on `/api/generate` | Task 3 |
| §4.9 contract test for groups | Task 7 |
| §5.1 ModeToggle | Task 14 |
| §5.2 ParamsPanel basic/advanced | Task 8 |
| §5.3 seed control | Task 9 |
| §5.4 History updates (kind/seedUsed/speakers + reuse) | Task 10 |
| §5.5 DialogComposer + SpeakerSlot | Tasks 14, 15 |
| §5.6 Studio integration | Task 16 |
| §5.7 frontend tests | Tasks 8, 9, 10, 13, 15 |
| §6 edge cases | Task 11 (parser), Task 12 (endpoint errors), Task 10 (Dexie v2) |
| §7 implementation order | Tasks 1–17 follow the 8-phase order |

No gaps.

**2. Placeholder scan:**

Searched for `TBD`, `TODO`, `fill in`, `implement later`, "Similar to Task". None present. All steps include the actual code/command.

**3. Type consistency:**

- `apply_seed` exported from `server.seed` — used in Tasks 3, 4, 5, 6, 12. Same signature.
- Adapter `generate` returns `tuple[bytes, int, int]` — established in Task 3, used in Tasks 4–6 and Task 12 (`adapter.generate(...)`).
- `X-Seed-Used` header set in Tasks 3 (single) and 12 (dialog). Frontend reads it in Tasks 10 (single) and 13 (dialog). Same casing handled by lowercase header lookup.
- `HistoryRecord` gains `kind`, `seedUsed`, `speakers?` in Task 10; consumed in Task 10 (HistoryList) and produced in Task 16 (Studio). Same field names everywhere.
- `DialogSubmit` defined in Task 15 (DialogComposer); consumed in Task 16 (Studio).
- `ModelInfo.params` flow: `params` produced server-side (Tasks 1, 4, 5, 6) → `/api/models` already serializes via `model_dump()` (no code change needed) → consumed in `ParamsPanel` (Task 8) and `DialogComposer` (Task 15).
- The frontend `ParamSpec` type gains `group?` in Task 8; tests in Tasks 8, 9, 13, 15 include `group: "basic"` / `"advanced"` where relevant.

No inconsistencies.

---

*End of plan.*
