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
