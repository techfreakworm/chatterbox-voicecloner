---
title: Chatterbox Voice Studio
emoji: "🎙"
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Voice cloning studio for the Chatterbox TTS family.
---

# Chatterbox Voice Studio

[![Open in Spaces](https://huggingface.co/datasets/huggingface/badges/resolve/main/open-in-hf-spaces-md.svg)](https://huggingface.co/spaces/techfreakworm/chatterbox-voice-studio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A multi-platform browser-based voice cloning studio for the Chatterbox TTS family
(English, Turbo, Multilingual). Runs locally on macOS (MPS), Linux (CUDA/CPU),
and Windows (CUDA/CPU). Deploys to Hugging Face Spaces (Free CPU by default,
ZeroGPU-decorator-ready).

## Quick start (local)

### macOS / Linux

    ./scripts/start.sh

Prereqs: Python 3.11+ and Node.js 20+. If missing, the script will tell you
the one-line install command for your platform (`brew install python@3.11`
on macOS, `apt install python3.11 python3.11-venv` on Debian/Ubuntu).

### Windows

    scripts\start.bat

If Python 3.11 or Node.js LTS isn't installed, the script will detect that
and offer to install them via `winget` (built into Windows 10 1809+ and
Windows 11). Accept the prompt and re-run `scripts\start.bat` after install
finishes so the new PATH takes effect.

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

## Architecture

- **Backend:** FastAPI + uvicorn. Three Chatterbox model adapters behind a
  swap-on-demand registry. Server is **stateless**; nothing user-visible
  persists across server restarts.
- **Frontend:** React + Vite + Tailwind + shadcn/ui. Voice library and
  generation history live in the browser via IndexedDB (Dexie).
- **One-click:** `scripts/start.sh` (mac/linux) or `scripts/start.bat`
  (windows) handles venv, install, build, serve, and opens Chrome.
- **HF Spaces:** Dockerfile multi-stage build — Node stage builds the SPA,
  Python stage runs uvicorn with the bundled static files.
