# Param Expansion + Dialog Mode — Design Spec

**Date:** 2026-04-29
**Status:** Approved (Sections 1–3) — ready for implementation plan
**Repo:** `/Users/techfreakworm/Projects/llm/chatterbox-voicecloner`
**Builds on:** `docs/superpowers/specs/2026-04-28-chatterbox-voice-studio-design.md`

---

## 1. Problem & Goals

The first-cut studio exposes only `exaggeration`, `cfg_weight`, and `temperature` per adapter. The underlying `chatterbox-tts` package supports more knobs (samplers, repetition penalty, reproducibility seeds, top-k for turbo). The popular comfyui community node *FL Chatterbox* exposes these and a fourth "Dialog TTS" workflow that synthesizes multi-speaker scenes by routing each `SPEAKER A:` / `SPEAKER B:` line to the matching reference clip.

This spec adds:

1. **Full parameter coverage** for all three existing adapters (en/turbo/mtl), grouped into Basic and Advanced.
2. **Reproducibility** via a `seed` parameter (with `-1` = random, used seed echoed back).
3. **Dialog mode** — a multi-speaker composer that runs the user-chosen engine per turn and concatenates the result.

### Non-goals

- "Control after generate" comfyui-style dropdown (randomize / fixed / increment). The `-1`-as-random convention covers it.
- Per-turn param overrides in Dialog mode.
- Crossfade between Dialog turns (fixed 250ms silence).
- More than 4 speakers (A–D, matching comfyui).
- Voice conversion (`chatterbox.vc`).
- Streaming partial Dialog playback — full WAV returned.

### Success criteria

1. Each adapter's `/api/models` entry returns the expanded `params` list with `group` set on every entry.
2. The frontend renders Basic params always-visible and Advanced params inside a collapsible disclosure.
3. `seed=-1` makes each generation use a fresh random seed; the response header `X-Seed-Used` carries the actual seed; the History row shows that seed and provides a one-click "reuse" button.
4. A new `/api/generate/dialog` endpoint accepts 1–4 reference clips, parses `SPEAKER X:` text, generates per turn with the chosen engine, and returns a single concatenated WAV.
5. Dialog mode is selectable via a `Single voice / Dialog` mode toggle in the Studio header area; the composer adapts.
6. Existing single-voice flow continues to work unchanged.

---

## 2. Decisions Locked In

| # | Decision | Rationale |
|---|---|---|
| Q1 | **B — Dialog lets user pick underlying engine per session** (en/turbo/mtl) | Lets you do English-fast, English-expressive, and 23-language dialog from the same UI. Keeps engine switching honest (mtl needs the language picker). |
| Q2 | **C — Hide seed and rarely-used params behind an Advanced toggle** | Most generations don't tune samplers; the disclosure keeps the form scannable while still allowing full control. |
| Q3 | **A — Take the proposed Basic/Advanced split as-is** | See §4.2 for the per-adapter split. |

---

## 3. Architecture Delta

```
chatterbox-voicecloner/
├── server/
│   ├── seed.py                       (NEW)
│   ├── dialog.py                     (NEW)
│   ├── schemas.py                    + ParamSpec.group
│   ├── main.py                       + /api/generate/dialog, X-Seed-Used header
│   └── models/
│       ├── chatterbox_en.py          expanded params + seed
│       ├── chatterbox_turbo.py       expanded params + seed
│       └── chatterbox_mtl.py         expanded params + seed
├── tests/
│   ├── test_seed.py                  (NEW)
│   ├── test_dialog_parser.py         (NEW)
│   ├── test_dialog_endpoint.py       (NEW)
│   ├── test_adapter_contract.py      assert every param has a valid group
│   └── test_main_generate.py         assert X-Seed-Used header present
├── web/
│   └── src/
│       ├── components/
│       │   ├── ModeToggle.tsx        (NEW)
│       │   ├── SpeakerSlot.tsx       (NEW)
│       │   ├── DialogComposer.tsx    (NEW)
│       │   ├── ParamsPanel.tsx       basic vs advanced disclosure
│       │   ├── HistoryList.tsx       seed display + reuse button + dialog badge
│       │   └── TagBar.tsx            (unchanged behavior)
│       ├── lib/
│       │   ├── api.ts                + generateDialog(); read X-Seed-Used
│       │   └── idb.ts                HistoryRecord: + kind, seedUsed, speakers?
│       └── pages/Studio.tsx          mode-aware composer
└── scripts/smoke.sh                  + dialog smoke step
```

No changes to launcher scripts, Dockerfile, or repo-level files.

---

## 4. Backend

### 4.1 `ParamSpec.group`

```python
ParamGroup = Literal["basic", "advanced"]

class ParamSpec(BaseModel):
    ...
    group: ParamGroup = "basic"
```

`/api/models` already returns `params` via `model_dump()`, so the new field flows to the frontend automatically.

### 4.2 Per-adapter parameter table

Defaults reflect either the underlying `chatterbox-tts` defaults or the FL Chatterbox node defaults, whichever is more reasonable for a studio.

| Adapter | Basic | Advanced |
|---|---|---|
| **chatterbox-en** | `exaggeration` (0.5, 0–2, .05), `cfg_weight` (0.5, 0–1, .05), `temperature` (0.8, 0.1–1.5, .05) | `seed` (int, default −1), `repetition_penalty` (1.2, 1.0–3.0, .05), `min_p` (0.05, 0.0–1.0, .01), `top_p` (1.0, 0.0–1.0, .01) |
| **chatterbox-turbo** | `temperature` (0.8, 0.1–1.5, .05), `top_p` (0.95, 0.0–1.0, .01), `repetition_penalty` (1.2, 1.0–3.0, .05) | `seed` (−1), `top_k` (1000, 1–4000, 1), `exaggeration` (0.0, 0–2, .05), `cfg_weight` (0.0, 0–1, .05) |
| **chatterbox-mtl** | `exaggeration` (0.5, 0–2, .05), `cfg_weight` (0.5, 0–1, .05), `temperature` (0.8, 0.1–1.5, .05), `repetition_penalty` (2.0, 1.0–3.0, .05) | `seed` (−1), `min_p` (0.05, 0.0–1.0, .01), `top_p` (1.0, 0.0–1.0, .01) |

`seed` is rendered by the frontend as a special "int with random" control (see §5.4); for the adapter contract it's just `type: "int"`, `default: -1`, `min: -1`.

Each adapter's `generate()` is extended with these kwargs; existing calls with smaller param dicts still work because each kwarg has a default in the adapter.

### 4.3 `server/seed.py` — seed helper

```python
import random
import torch


def apply_seed(seed: int | None) -> int:
    """Return the seed actually used. If seed is None or -1, draw one."""
    if seed is None or seed < 0:
        seed = random.randint(0, 2**31 - 1)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    mps = getattr(torch, "mps", None)
    if mps is not None:
        try:
            mps.manual_seed(seed)
        except Exception:
            pass
    random.seed(seed)
    return seed
```

Each `generate()` calls `seed_used = apply_seed(params.get("seed"))` immediately before invoking the underlying model. The endpoint wraps the call and adds `X-Seed-Used: {seed_used}` to the response.

### 4.4 `X-Seed-Used` response header

`/api/generate` and `/api/generate/dialog` both set this header. Adapter `generate()` returns `(wav_bytes, sample_rate, seed_used)` instead of `(wav_bytes, sample_rate)`. The endpoint adds the header before returning the streaming response.

This is a contract change visible to existing tests:

- `test_main_generate.py` — assert header present and parseable as int.
- The `FakeAdapter` in `conftest.py` returns a stable `seed_used = 0`.

### 4.5 Dialog parser (`server/dialog.py`)

```python
import re
from dataclasses import dataclass

_SPEAKER_RE = re.compile(r"^\s*SPEAKER\s+([A-D])\s*:\s*", re.MULTILINE)


@dataclass
class DialogTurn:
    speaker: str   # "A" | "B" | "C" | "D"
    text: str


class DialogParseError(ValueError):
    pass


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

### 4.6 Dialog generator

`server/dialog.py` also exposes `generate_dialog()`:

```python
async def generate_dialog(
    *,
    registry: Registry,
    engine_id: str,
    text: str,
    language: str | None,
    params: dict,
    speaker_refs: dict[str, str],   # letter -> filesystem path (already temped)
    silence_ms: int = 250,
) -> tuple[bytes, int, int]:        # (wav_bytes, sample_rate, seed_used)
```

Algorithm:

1. `parse_dialog(text)` → list of turns.
2. Validate: every turn's speaker letter has an entry in `speaker_refs`. Otherwise raise `DialogParseError("missing reference for speaker X")`.
3. `adapter = await registry.get_or_load(engine_id)`.
4. Resolve a single seed up front via `apply_seed(params.get("seed"))`. Re-apply this same value before each turn so the runs are reproducible together.
5. For each turn: `wav_bytes, sr, _ = adapter.generate(text=turn.text, reference_wav_path=speaker_refs[turn.speaker], language=language, params=params)`. Decode `wav_bytes` to mono float32 numpy.
6. Concatenate all turn arrays separated by `silence_ms` of zeros at the engine's sample rate.
7. Re-encode with `server.audio.write_wav_bytes` at `sr`.
8. Return `(wav, sr, seed_used)`.

### 4.7 New endpoint `POST /api/generate/dialog`

Multipart fields:

| Field | Required | Notes |
|---|---|---|
| `text` | ✓ | Body of the dialog with `SPEAKER X:` prefixes. |
| `engine_id` | ✓ | One of `chatterbox-en`, `chatterbox-turbo`, `chatterbox-mtl`. |
| `language` | conditionally | Required iff `engine_id == "chatterbox-mtl"`. |
| `params` | ✓ | JSON object — same shape as `/api/generate`. |
| `reference_wav_a` | conditionally | Required iff a SPEAKER A turn appears. Validated via `validate_reference_clip`. |
| `reference_wav_b` | conditionally | Required iff B appears. |
| `reference_wav_c` | conditionally | Required iff C appears. |
| `reference_wav_d` | conditionally | Required iff D appears. |

Errors:

- `400 dialog_format_invalid` — text has no SPEAKER tags.
- `400 dialog_missing_reference` — turn references a speaker with no clip uploaded.
- `400 reference_invalid` — a clip failed validation (forwarded from `validate_reference_clip`).
- `400 language_unsupported` — mtl engine without `language`.
- `404 model_not_found` — bad `engine_id`.
- `500 generation_failed` — adapter raised mid-dialog.

Response: `audio/wav` bytes; header `X-Seed-Used: <int>`.

### 4.8 `/api/generate` (existing, single-voice)

Adds the `X-Seed-Used` header. No other change. The existing `params` field already accepts arbitrary keys, so the new sampler params (`seed`, `repetition_penalty`, `min_p`, `top_p`, `top_k`) flow through with no schema change.

### 4.9 Adapter contract test extension

`test_adapter_contract.py` adds:

```python
def test_param_groups_are_valid(module_name):
    cls = importlib.import_module(module_name).Adapter
    for p in cls.params:
        assert p.group in {"basic", "advanced"}
```

---

## 5. Frontend

### 5.1 Mode toggle (`ModeToggle.tsx`)

Segmented control with two options: `Single voice` and `Dialog`. Lives in the header row, to the left of the model picker. Mode is hoisted into `Studio.tsx` state.

### 5.2 ParamsPanel: Basic / Advanced

```tsx
const basic = specs.filter(s => (s.group ?? "basic") === "basic");
const advanced = specs.filter(s => s.group === "advanced");

return (
  <div className="space-y-5">
    {basic.map(...)}
    {advanced.length > 0 && (
      <details className="card-paper p-3">
        <summary className="label-mono cursor-pointer select-none">
          ▸ advanced · {advanced.length} params
        </summary>
        <div className="mt-3 space-y-5">
          {advanced.map(...)}
        </div>
      </details>
    )}
  </div>
);
```

The summary swaps `▸` ↔ `▾` via the native `<details>` open state.

### 5.3 Seed control

Special-cased in `ParamsPanel` when `spec.name === "seed"`:

```tsx
<div className="flex items-baseline gap-3">
  <label className="label-mono">Seed</label>
  <input
    type="number"
    value={seedValue}
    onChange={...}
    className="field-input !w-40 font-mono text-[12px] py-1"
    min={-1}
  />
  <button onClick={() => set("seed", -1)} className="label-mono hover:text-foreground">
    ↻ random
  </button>
  {seedValue === -1 && (
    <span className="label-mono text-muted-foreground">(random per generate)</span>
  )}
</div>
```

### 5.4 History row updates

Each `HistoryRecord` gains:

```ts
type HistoryRecord = {
  ...
  kind: "single" | "dialog";
  seedUsed?: number;
  speakers?: { letter: string; voiceId: number }[];   // dialog-only
};
```

Schema migration handled at IndexedDB level by Dexie's `version(2)` upgrade with `kind: "single"` set on existing rows.

`HistoryList` renders:

- A `dialog · 2 spk · en` badge for dialog rows.
- A `seed 84233927 · ↻` element on every row. Clicking `↻` calls `onReuse(seed, params, ...)` to set the active params to those values. Studio.tsx handles propagating to the right composer.

### 5.5 Dialog composer (`DialogComposer.tsx`, `SpeakerSlot.tsx`)

State:

```ts
type Speakers = Partial<Record<"A" | "B" | "C" | "D", VoiceRecord>>;
```

UI sections (top to bottom):

1. **Speakers** — list of A/B (and optionally C/D) rows. Each row: letter badge, voice picker that opens the existing `VoiceLibrary` in select mode, ✕ to remove. `+ add speaker` button while count < 4.
2. **Engine** — radio group of the three real adapter labels. When `chatterbox-mtl` is picked, a language `<select>` appears beside it.
3. **Script** — same multi-line textarea + tag bar. The script gets a small helper row of speaker chips (`+ SPEAKER A`, etc.) that insert at the cursor. The chips list is gated by the speakers configured in step 1.
4. **Parameters** — the chosen engine's `ParamsPanel` (basic + advanced disclosure).
5. **Generate dialog** — primary CTA. Disabled while engine is loading or text is blank.

On submit, `DialogComposer` calls `lib/api.ts:generateDialog(...)`:

```ts
export async function generateDialog(input: {
  engineId: string;
  text: string;
  language?: string;
  params: Record<string, unknown>;
  speakers: { letter: "A"|"B"|"C"|"D"; reference: Blob }[];
}): Promise<{ blob: Blob; seedUsed: number | null }> { ... }
```

The function builds multipart with `reference_wav_<letter>` keys, posts, reads `X-Seed-Used`, returns both.

### 5.6 Studio integration

`Studio.tsx` decides between `<SingleComposer>` and `<DialogComposer>` based on `mode`. Shared chrome (header, banners, history pane) stays put.

### 5.7 Tests

| File | Cases |
|---|---|
| `ParamsPanel.test.tsx` (extended) | basic always rendered; advanced hidden by default; opening the disclosure reveals advanced params; advanced edits propagate; `seed=-1` shows the "(random per generate)" hint. |
| `DialogComposer.test.tsx` (new) | starts with two speaker slots A and B; "+ add speaker" appends C; can't exceed 4; engine pick toggles language picker on mtl; helper chips inject at cursor. |
| `idb.test.ts` (extended) | migrating from v1 to v2 sets `kind: "single"` on existing rows; round-trip of dialog row with `speakers` and `seedUsed`. |
| `api.test.ts` (extended) | `generateDialog` posts the right multipart fields; reads `X-Seed-Used` from response headers. |

---

## 6. Edge Cases (frozen)

| Case | Resolution |
|---|---|
| Dialog text has no SPEAKER prefix | 400 `dialog_format_invalid`. |
| Turn references unloaded speaker | 400 `dialog_missing_reference`. |
| Multi-line block within a single speaker turn | All lines until next `SPEAKER X:` belong to that speaker. |
| Same speaker in 3 consecutive turns | Three separate generate calls, three concatenated outputs. |
| One turn longer than engine's max input | Forwarded — `generation_failed` surfaces the engine error. |
| mtl + dialog without `language` | 400 `language_unsupported`. |
| Seed `-1` in dialog | One seed drawn; reapplied before each turn for reproducibility. |
| Migration of legacy History rows (no `kind`) | Dexie v2 upgrade sets `kind: "single"`. |
| MPS-specific seed | `apply_seed` calls `torch.mps.manual_seed` only if available; failures swallowed. |

---

## 7. Implementation Order (preview)

1. `ParamSpec.group` + adapter param expansion (en/turbo/mtl) + `apply_seed` helper + tests.
2. Wire `X-Seed-Used` response header in `/api/generate`; `FakeAdapter` returns a fixed seed; tests.
3. Frontend ParamsPanel basic/advanced split + seed control + History seed display + reuse button.
4. `dialog.py` parser + tests.
5. `dialog.py` generator + `/api/generate/dialog` endpoint + tests.
6. `ModeToggle`, `SpeakerSlot`, `DialogComposer` components + tests.
7. Studio integration (mode-aware render).
8. Smoke script extension; manual e2e on Mac (en, turbo, mtl single + en dialog).

Each phase ends with a green `pytest`/`vitest`/build and a sole-author commit per the existing CLAUDE.md policy.

---

*End of design spec.*
