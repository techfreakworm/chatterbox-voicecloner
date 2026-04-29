"""FastAPI application factory."""
from __future__ import annotations

import json
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from server.audio import AudioValidationError, validate_reference_clip
from server.device import select_device
from server.registry import Registry
from server.zerogpu import decorate


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

    origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
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

    @app.get("/api/models")
    def list_models() -> list[dict]:
        return app.state.registry.list_models()

    @app.get("/api/models/active")
    def active_model() -> dict:
        return app.state.registry.status()

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

        ref_path: str | None = None
        if reference_wav is not None:
            data = await reference_wav.read()
            try:
                validate_reference_clip(data)
            except AudioValidationError as exc:
                detail = {
                    "size_bytes": len(data),
                    "first_4": data[:4].decode("latin-1", errors="replace"),
                    "filename": reference_wav.filename,
                    "content_type": reference_wav.content_type,
                }
                print(
                    f"[reference_invalid] {exc} | {detail}",
                    flush=True,
                )
                return JSONResponse(
                    status_code=400,
                    content={
                        "error": {
                            "code": "reference_invalid",
                            "message": str(exc),
                            "detail": detail,
                        }
                    },
                )
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            tmp.write(data)
            tmp.flush()
            tmp.close()
            ref_path = tmp.name

        gen_fn = decorate(adapter.generate)
        try:
            wav_bytes, _sr = gen_fn(text, ref_path, language, json.loads(params or "{}"))
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "generation_failed", "message": str(exc)}},
            )
        return Response(content=wav_bytes, media_type="audio/wav")

    @app.exception_handler(HTTPException)
    async def _http_exc(request, exc: HTTPException):
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            return JSONResponse(status_code=exc.status_code, content=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": "http_error", "message": str(exc.detail)}},
        )

    if STATIC_DIR.exists():
        app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

    return app


app = build_app()
