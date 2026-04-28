# Project Guidelines

## Git authorship

The repository owner (Mayank Gupta) is the **sole author** on every commit. Never add Claude as author or co-author.

Do not include any of these in commit messages or PR bodies:

- `Co-Authored-By: Claude ...` trailer
- `Generated with Claude Code` line or footer
- Any other attribution to AI assistants

Use the existing local git config; do not override `user.name` / `user.email` and do not pass `--author` to override the committer.

## Project structure

- Backend: `server/` (FastAPI, Python 3.11)
- Frontend: `web/` (React + Vite + Tailwind + shadcn/ui)
- One-click launchers: `scripts/start.sh` (mac/linux), `scripts/start.ps1` (windows)
- HF Spaces deploy: `Dockerfile`
- Specs: `docs/superpowers/specs/`

## Working preferences

- Multi-platform code: must run on macOS (MPS), Linux (CUDA/CPU), Windows (CUDA/CPU), and HF Spaces (Free CPU).
- ZeroGPU-ready: keep the `@spaces.GPU` decorator path working as a no-op locally.
- Server is **stateless**. All voice library and history persistence lives in browser IndexedDB. Do not add server-side DBs.
- YAGNI: don't add features beyond what the spec calls for.
