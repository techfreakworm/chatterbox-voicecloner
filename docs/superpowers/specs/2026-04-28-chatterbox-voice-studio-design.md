# Chatterbox Voice Studio — Design Spec

**Date:** 2026-04-28
**Status:** Approved (sections 1–3) — ready for implementation plan
**Author:** brainstorm session
**Repo:** `/Users/techfreakworm/Projects/llm/chatterbox-voicecloner`

---

## 1. Problem & Goals

Build a polished, multi-platform, browser-based voice cloning studio around the **Chatterbox** TTS model family from Resemble AI. The same codebase must run on:

- **Local** — macOS (Apple Silicon, MPS), Linux (CUDA/CPU), Windows (CUDA/CPU)
- **Hugging Face Spaces** — Free CPU tier as the default deploy target, with code that lights up automatically on ZeroGPU if redeployed there

Primary user flow: pick a Chatterbox model → supply a reference voice clip (saved, uploaded, or recorded) → enter text (with model-appropriate paralinguistic tags and language) → generate → play / download / save to history.

### Non-goals

- Long-form chunking, batch CSV, project management, multi-user auth, MP3 export, timeline editing — all explicitly postponed.
- Non-Chatterbox model adapters — interface is extensible, but no other adapter ships.

### Success criteria

1. `./scripts/start.sh` (or `start.ps1` on Windows) on a clean machine runs venv setup, installs deps, builds the SPA, starts the server, and opens Chrome at the studio in one command.
2. All three Chatterbox variants are usable from the UI with adapter-specific controls (params / language / tags) auto-rendered.
3. Switching active model unloads the previous and loads the next without leaking GPU memory.
4. Same code, no edits, deploys to a Free CPU HF Space via `Dockerfile`. Generations succeed (slowly).
5. `@spaces.GPU` decorator is in place; if the same image is later deployed to a ZeroGPU Space, GPU acceleration is automatic, no code change required.
6. Server is stateless: nothing user-visible persists across server restarts. All saved voices and history live in the browser via IndexedDB.

---

## 2. Decisions Locked In (from brainstorm)

| # | Decision | Rationale |
|---|---|---|
| Q1 | **B — Voice Studio scope** (saved voices, history, favorites, presets) | Enough polish to feel like a real product; avoids long-form/batch complexity. |
| Q2 | **A — FastAPI + React/Vite SPA** | Frontend-design skill targets React/Tailwind/shadcn; HF Space deploys via Dockerfile, well-trodden path. |
| Q3 | **A — Single active model, swap on demand** | Fits Free CPU and ZeroGPU memory budgets; avoids worker-pool complexity. |
| Q3-tier | **Free CPU as default; ZeroGPU-decorator-ready** | Zero ongoing cost; one decorator lets a future redeploy use ZeroGPU. |
| Q4 | **A — Per-browser IndexedDB persistence; server stateless** | Sidesteps HF Spaces ephemeral filesystem and public-by-default privacy concerns. |

---

## 3. Architecture

### 3.1 Repo layout

```
chatterbox-voicecloner/
├── server/                       # FastAPI app
│   ├── __init__.py
│   ├── main.py                   # Routes, CORS, static serving, lifespan
│   ├── device.py                 # Auto-detect cuda > mps > cpu (env override)
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py               # ModelAdapter ABC + ParamSpec, Lang dataclasses
│   │   ├── chatterbox_en.py      # Wraps chatterbox.tts.ChatterboxTTS
│   │   ├── chatterbox_turbo.py   # Wraps chatterbox.tts_turbo.ChatterboxTurboTTS
│   │   └── chatterbox_mtl.py     # Wraps chatterbox.mtl_tts.ChatterboxMultilingualTTS
│   ├── registry.py               # Active-model registry + async swap lock + SSE events
│   ├── audio.py                  # WAV write/read, normalize, validate ref clips
│   ├── schemas.py                # Pydantic request/response models
│   ├── zerogpu.py                # `decorate()` no-op or @spaces.GPU
│   └── static/                   # web/dist gets copied here at build time
├── web/                          # Vite + React + Tailwind
│   ├── src/
│   │   ├── main.tsx, App.tsx
│   │   ├── components/
│   │   │   ├── ui/               # shadcn primitives
│   │   │   ├── ModelPicker.tsx
│   │   │   ├── VoiceComposer.tsx
│   │   │   ├── ParamsPanel.tsx
│   │   │   ├── TagBar.tsx
│   │   │   ├── VoiceLibrary.tsx
│   │   │   ├── HistoryList.tsx
│   │   │   └── DeviceBadge.tsx
│   │   ├── pages/Studio.tsx
│   │   ├── lib/
│   │   │   ├── api.ts            # Typed fetch wrappers (generate, models, SSE)
│   │   │   ├── idb.ts            # Dexie schema + CRUD for voices, history
│   │   │   ├── audio.ts          # MediaRecorder, waveform, trim, normalize
│   │   │   └── theme.ts          # Dark/light token wiring
│   │   └── styles/index.css      # Tailwind layer
│   ├── index.html
│   ├── vite.config.ts            # Proxies /api → :7860 in dev
│   ├── tailwind.config.ts
│   ├── postcss.config.cjs
│   ├── tsconfig.json
│   └── package.json
├── scripts/
│   ├── start.sh                  # Bash one-click (mac/linux)
│   ├── start.ps1                 # PowerShell one-click (windows)
│   ├── start.bat                 # Tiny shim that calls start.ps1
│   └── smoke.sh                  # Health + list-models + 1-sentence gen check
├── tests/
│   ├── test_device.py
│   ├── test_registry.py
│   ├── test_adapter_contract.py
│   ├── test_api_schema.py
│   └── conftest.py
├── Dockerfile                    # HF Spaces deploy
├── .dockerignore
├── .gitignore
├── README.md
├── requirements.txt
├── pytest.ini
├── .python-version               # 3.11
└── docs/superpowers/specs/2026-04-28-chatterbox-voice-studio-design.md
```

### 3.2 Process model

| Mode | Processes | Notes |
|---|---|---|
| **Dev (local)** | `uvicorn server.main:app --reload` + `npm run dev` | Vite proxies `/api` to port 7860. Two terminals. |
| **One-click (local)** | `start.sh` orchestrates: venv → install → build SPA → copy dist → uvicorn → open browser | Single command, single served origin. |
| **HF Space** | `Dockerfile` builds SPA in stage 1, runs uvicorn in stage 2 on port `7860` | Single process. Static + API on same origin. |

### 3.3 Device selection (`server/device.py`)

```python
def select_device() -> str:
    forced = (os.getenv("CHATTERBOX_DEVICE") or "").lower()
    if forced in {"cuda", "mps", "cpu"}:
        return forced
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"
```

MPS-specific guards (learned from prior LTX-2.3 work — see memory `project_ltx_gemma_root.md`):

- Force fp32 on MPS by default for the language model parts unless we verify fp16 works for a given Chatterbox checkpoint.
- Catch `RuntimeError: meta tensor` at adapter `load()`, log once, retry with `map_location="cpu"` then `.to("mps")`.
- `PYTORCH_ENABLE_MPS_FALLBACK=1` set in `start.sh` to allow CPU fallback for unimplemented ops.

---

## 4. Model Adapters

### 4.1 Interface (`server/models/base.py`)

```python
@dataclass
class Lang:
    code: str           # "en", "fr", "hi", ...
    label: str          # "English", "French", "Hindi", ...

@dataclass
class ParamSpec:
    name: str           # "exaggeration"
    label: str          # "Exaggeration"
    type: Literal["float", "int", "bool", "enum"]
    default: float | int | bool | str
    min: float | int | None = None
    max: float | int | None = None
    step: float | int | None = None
    choices: list[str] | None = None
    help: str = ""

class ModelAdapter(Protocol):
    id: ClassVar[str]
    label: ClassVar[str]
    description: ClassVar[str]
    languages: ClassVar[list[Lang]]
    paralinguistic_tags: ClassVar[list[str]]
    supports_voice_clone: ClassVar[bool]
    params: ClassVar[list[ParamSpec]]

    def __init__(self, device: str): ...
    def load(self) -> None: ...
    def unload(self) -> None: ...
    def generate(
        self,
        text: str,
        reference_wav_path: str | None,
        language: str | None,
        params: dict[str, Any],
    ) -> tuple[bytes, int]: ...   # (wav_bytes, sample_rate)
```

### 4.2 Concrete adapters

| Adapter id | Wraps | Languages | Tags | Params (with defaults) |
|---|---|---|---|---|
| `chatterbox-en` | `chatterbox.tts.ChatterboxTTS` | `[en]` | `[]` | `exaggeration` (0.0–2.0, def 0.5), `cfg_weight` (0.0–1.0, def 0.5), `temperature` (0.1–1.5, def 0.8) |
| `chatterbox-turbo` | `chatterbox.tts_turbo.ChatterboxTurboTTS` | `[en]` | `[laugh]`, `[cough]`, `[chuckle]` | `temperature` (0.1–1.5, def 0.8), `cfg_weight` (0.0–1.0, def 0.5) |
| `chatterbox-mtl` | `chatterbox.mtl_tts.ChatterboxMultilingualTTS` | 23 langs (ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko, ms, nl, no, pl, pt, ru, sv, sw, tr, zh) | (whatever the model emits — TBD when we wire it) | `language_id` (enum), `exaggeration`, `cfg_weight` |

Adapters declare metadata as class attributes so the registry can serve `/api/models` without instantiating the adapter (no torch import cost for a list call).

### 4.3 Generate flow

1. Validate request via Pydantic.
2. Registry resolves adapter; if not active, swap (see §5).
3. Reference clip (if any) saved to a tempfile, validated (`audio.validate_reference()` — duration 1s–60s, sample rate ≥16kHz, mono after downmix).
4. `decorated_generate(text, ref_path, language, params)` — the function carries the `@spaces.GPU` decorator (no-op locally).
5. Returns `(wav_bytes, sample_rate)`; FastAPI streams as `audio/wav`.

---

## 5. Registry & Model Swap (`server/registry.py`)

```python
class Registry:
    _active: ModelAdapter | None
    _lock: asyncio.Lock
    _status: Literal["idle", "loading", "loaded", "error"]
    _last_error: str | None
    _events: asyncio.Queue   # SSE event bus

    async def get_or_load(self, model_id: str) -> ModelAdapter
    async def status(self) -> dict
    async def stream_events(self) -> AsyncIterator[bytes]
```

- `_lock` serializes activation requests; concurrent generates against the *same* active model proceed without contention.
- Generates against a *different* model id wait on the lock and trigger a swap.
- Swap order: `unload(old) → torch.cuda.empty_cache() / mps_empty_cache → instantiate(new) → load(new)`.
- Status events emitted at each step → `/api/models/active/events` (SSE).

---

## 6. REST API

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | — | `{device, torch, model_status}` |
| GET | `/api/models` | — | `[{id, label, description, languages, paralinguistic_tags, supports_voice_clone, params}]` |
| GET | `/api/models/active` | — | `{id|null, status, last_error|null}` |
| POST | `/api/models/{id}/activate` | — | `202` + SSE on `/api/models/active/events` |
| GET | `/api/models/active/events` | — | SSE stream: `loading`, `loaded`, `error` |
| POST | `/api/generate` | multipart: `text`, `model_id`, `language?`, `params` (json), `reference_wav?` | `audio/wav` stream |

Errors are JSON: `{error: {code, message, detail?}}`. Codes: `model_not_found`, `model_load_failed`, `language_unsupported`, `reference_invalid`, `generation_failed`.

CORS: `http://localhost:5173` (Vite dev) + same-origin. Configurable via `CORS_ORIGINS` env.

---

## 7. ZeroGPU Compatibility (`server/zerogpu.py`)

```python
try:
    import spaces
    def decorate(fn):  # 120s budget covers cold-load + generate
        return spaces.GPU(duration=120)(fn)
except ImportError:
    def decorate(fn):
        return fn
```

Each adapter exports its `generate` method through `decorate()` at registration time. Locally and on Free CPU Spaces this is a no-op. On a ZeroGPU Space, the decorator activates and shuttles the call to a borrowed A100 per request — no architectural change.

`spaces` is **not** in `requirements.txt`; it's pre-installed in the HF ZeroGPU image. Local installs see the `ImportError` branch.

---

## 8. Frontend

### 8.1 Layout (single page: Studio)

Two-column. Dark mode default. Designed via the **frontend-design** skill (Tailwind tokens, shadcn/ui primitives, custom typography and accent palette — explicitly not generic AI aesthetics).

```
Header  [logo] [model chip ▾] [device badge] [theme]
─────────────────────────────────────────────────────
LEFT — Composer                         RIGHT — Workspace
  Voice selector                        Tabs: Voices | History
   (saved | upload | record)
   waveform preview                     Voices
                                          card grid: name, waveform,
  Language picker (mtl only)              play, rename, delete, ★
                                          [+ New voice]
  Text editor + char counter
  Tag chips (model-specific)            History
                                          last 50 rows: text, model,
  Params panel (auto-rendered             voice, time, play, download,
   from adapter.params)                   regenerate
   Presets: Default · Expressive ·
            Calm · Neutral
  [ Generate ] (large)
  Output player + download
```

### 8.2 Frontend ↔ adapter contract

The adapter `params` array is the source of truth. The `ParamsPanel` component reads it and renders:
- `float` / `int` → slider with min/max/step + numeric input
- `bool` → switch
- `enum` → segmented control or select

Adding a future param requires zero frontend code.

### 8.3 Persistence (Dexie / IndexedDB)

Schema v1:

```ts
voices: '++id, name, createdAt, isFavorite'
  // value: {id, name, blob: Blob, sampleRate, durationMs, createdAt, isFavorite}

history: '++id, createdAt'
  // value: {id, text, modelId, voiceId, language, params, audioBlob, createdAt}
```

- Voice list unbounded; warn when total blob size > 50MB.
- History capped at 50 entries; oldest evicted on insert.
- All operations local; no server round-trip.

### 8.4 Key UX details

- **Switching models** → top-of-page banner with progress; model-specific UI (language picker, tag bar, params) re-renders when adapter metadata changes.
- **Recording voices** → MediaRecorder API, 5–30s suggested, visible waveform live, simple silence-trim before save.
- **Generating** → "Generate" disabled while a generation is in flight or while a model is loading; output appears in player immediately on response, auto-saved to history.
- **Tag insertion** → tag chips above textarea insert at cursor; only shown for models whose adapter declares non-empty `paralinguistic_tags`.
- **Voice required** → if `supports_voice_clone` and no voice selected, "Generate" is disabled with tooltip.

---

## 9. One-click Start Scripts

### 9.1 `scripts/start.sh` (macOS/Linux)

Idempotent. Each step skipped if already done.

1. Check `python3.11` (or `python3.12`) on PATH; abort with install hint if missing.
2. `python3.11 -m venv .venv` if `.venv` missing.
3. `source .venv/bin/activate`.
4. `pip install -r requirements.txt` (skipped if `.venv/.installed-marker` matches `requirements.txt` hash).
5. `cd web && (npm ci if node_modules missing) && (npm run build if web/dist missing or stale)`.
6. `cp -r web/dist/* server/static/`.
7. `export PYTORCH_ENABLE_MPS_FALLBACK=1` (mac).
8. `uvicorn server.main:app --host 127.0.0.1 --port 7860 &`.
9. `python -m webbrowser http://127.0.0.1:7860`.
10. `wait` on the uvicorn pid; trap SIGINT to clean shutdown.

### 9.2 `scripts/start.ps1` (Windows)

Mirror of the above using `py -3.11`, `Start-Process`, and PowerShell idioms. `start.bat` is a one-line shim invoking PowerShell.

### 9.3 `scripts/smoke.sh`

Curls `/api/health`, `/api/models`, activates `chatterbox-en`, runs a 1-sentence generation, validates WAV header. Used after `start.sh` to confirm the stack is alive.

---

## 10. Dockerfile (HF Spaces)

Multi-stage:

```Dockerfile
# Stage 1 — build SPA
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2 — runtime
FROM python:3.11-slim
ENV HF_HOME=/tmp/hf \
    PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      libsndfile1 ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ server/
COPY --from=web /web/dist server/static/
EXPOSE 7860
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

HF Spaces auto-detects port 7860 and exposes the URL.

This Dockerfile installs **CPU torch** and is the right image for the Free CPU tier and for local Linux dev. For a future ZeroGPU deploy: same Dockerfile, but swap the torch line in `requirements.txt` for the HF-recommended GPU wheel and let HF's runtime inject the `spaces` package — no other change.

---

## 11. Error Handling (boundary-only)

- Adapter `load()` failures → registry sets status `error`, surfaces `last_error`; `/api/generate` returns 503 with `model_load_failed`. UI shows banner with retry button.
- MPS dtype/meta-tensor failures → caught at `load()`, logged once with diagnostic, retried in fp32 / via `map_location="cpu"`.
- Reference clip rejected (duration / format / sample rate) → 400 `reference_invalid`. UI shows inline error on the voice card.
- Unknown `language` for the active model → 400 `language_unsupported`.
- HF Spaces ephemeral filesystem: weight cache lives at `HF_HOME=/tmp/hf` — wiped on Space restart, re-downloaded on next call. Acceptable trade-off.

No error handling for "internal code wrote bad data" — trust internal contracts.

---

## 12. Testing

### 12.1 Backend (`pytest`)

- `test_device.py` — `select_device()` honors env override and platform availability.
- `test_registry.py` — swap unloads previous, lock serializes concurrent activations, SSE events emitted in correct order.
- `test_adapter_contract.py` — each adapter declares non-empty `id`, valid `params` (every default within min/max), languages/tags lists are typed correctly. Doesn't load weights.
- `test_api_schema.py` — `/api/models` shape, `/api/generate` validation (missing fields, oversized text, bad language).

Real-model `generate` is **not** unit-tested in CI — torch + Chatterbox download is too heavy. Manual smoke covers it.

### 12.2 Frontend (`vitest` + RTL)

- `idb.test.ts` — voice/history CRUD round-trip.
- `audio.test.ts` — recording state machine transitions.
- `ParamsPanel.test.tsx` — auto-renders sliders/switches/selects from a `ParamSpec[]` fixture.
- `Studio.test.tsx` — voice-required guard disables generate; model-specific UI conditionally renders.

### 12.3 Manual smoke

`scripts/smoke.sh` runs against the live server; documented in README.

---

## 13. Open Questions / TBD

1. Does `chatterbox-mtl` emit any paralinguistic tags? (To populate `chatterbox_mtl.paralinguistic_tags`.) Verify when wiring the adapter; for the spec we assume `[]` until verified.
2. Exact CFG/exaggeration ranges for each model — ranges in §4.2 are conservative; will be tuned against the official examples.
3. Whether the `chatterbox-tts` PyPI package version pinned in `requirements.txt` includes all three classes by the time we install. If not, fall back to `pip install git+https://github.com/resemble-ai/chatterbox`.

These are implementation-time questions, not design questions — they don't affect the architecture.

---

## 14. Out of Scope (explicit YAGNI)

- Long-form text chunking with per-chunk regeneration
- Batch CSV jobs
- Side-by-side model comparison view
- MP3/Opus export
- Project / multi-document organization
- Multi-user auth
- Mobile-optimized layout (desktop Chrome is the target)
- Non-Chatterbox model adapters
- Streaming audio (chunked) — full-WAV-on-completion is fine for studio scale

Any of these can be added later without touching the core architecture.

---

## 15. Implementation Phases (preview — full plan in writing-plans skill)

1. **Scaffold** — repo skeleton, `requirements.txt`, `package.json`, `.python-version`, `.gitignore`, dummy `start.sh` that just runs uvicorn with a health endpoint.
2. **Backend core** — `device.py`, `base.py`, `registry.py`, `audio.py`, `schemas.py`, `main.py` with `/api/health`, `/api/models`, `/api/models/active`. Pytest for these.
3. **First adapter (`chatterbox-en`)** — load, generate, manual smoke.
4. **Adapter 2 & 3** — `chatterbox-turbo`, `chatterbox-mtl`. Registry swap exercised.
5. **ZeroGPU shim** — `zerogpu.py`, decorator wired.
6. **Frontend scaffold** — Vite + Tailwind + shadcn, theme tokens, Studio shell.
7. **Composer + Voice library + History** — IndexedDB, recording, waveform.
8. **ParamsPanel auto-render + Tag bar + Language picker** — driven by adapter metadata.
9. **Generate end-to-end** — wire to `/api/generate`, output player, history insert.
10. **One-click scripts** — `start.sh`, `start.ps1`, `smoke.sh`. Test on Mac.
11. **Dockerfile** — multi-stage, build, run locally to confirm. Push to HF Space, verify Free CPU works.
12. **Polish pass** — frontend-design skill review, accessibility (keyboard, focus, aria), copy.

---

*End of design spec.*
