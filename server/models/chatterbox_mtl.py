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
