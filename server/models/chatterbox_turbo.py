"""Chatterbox Turbo adapter — fast English with paralinguistic tags."""
from __future__ import annotations

import io
from typing import Any, ClassVar

import soundfile as sf

from server.schemas import Lang, ParamSpec
from server.seed import apply_seed


class Adapter:
    id: ClassVar[str] = "chatterbox-turbo"
    label: ClassVar[str] = "Chatterbox Turbo"
    description: ClassVar[str] = (
        "Faster, lower-VRAM English variant. Supports event tags: "
        "[laugh] [chuckle] [sigh] [gasp] [cough] [sniff] [groan] [clear throat] [shush]."
    )
    languages: ClassVar[list[Lang]] = [Lang(code="en", label="English")]
    paralinguistic_tags: ClassVar[list[str]] = [
        "[laugh]",
        "[chuckle]",
        "[sigh]",
        "[gasp]",
        "[cough]",
        "[sniff]",
        "[groan]",
        "[clear throat]",
        "[shush]",
    ]
    supports_voice_clone: ClassVar[bool] = True
    params: ClassVar[list[ParamSpec]] = [
        ParamSpec(
            name="temperature", label="Temperature", type="float",
            default=0.8, min=0.1, max=1.5, step=0.05,
            help="Sampling randomness. Lower = deterministic and safer; higher = more creative but riskier and prone to artifacts.",
            group="basic",
        ),
        ParamSpec(
            name="top_p", label="Top p", type="float",
            default=0.95, min=0.0, max=1.0, step=0.01,
            help="Nucleus sampling. Keep tokens until cumulative probability reaches this. Lower = safer/conservative.",
            group="basic",
        ),
        ParamSpec(
            name="repetition_penalty", label="Repetition penalty", type="float",
            default=1.2, min=1.0, max=3.0, step=0.05,
            help="Discourages repeating the same tokens. >1 reduces stuttering and loops; too high hurts natural fluency.",
            group="basic",
        ),
        ParamSpec(
            name="seed", label="Seed", type="int",
            default=-1, min=-1, step=1,
            help="Reproducibility. -1 draws a fresh random seed every run; any non-negative value pins the result so you can reproduce it.",
            group="advanced",
        ),
        ParamSpec(
            name="top_k", label="Top k", type="int",
            default=1000, min=1, max=4000, step=1,
            help="Sample only from the top-k most likely tokens. Higher = more diversity. Turbo defaults to a wide pool.",
            group="advanced",
        ),
        ParamSpec(
            name="exaggeration", label="Exaggeration", type="float",
            default=0.0, min=0.0, max=2.0, step=0.05,
            help="How emotive the speech is. Turbo defaults to 0 (flat); raise it for more expressive prosody.",
            group="advanced",
        ),
        ParamSpec(
            name="cfg_weight", label="CFG weight", type="float",
            default=0.0, min=0.0, max=1.0, step=0.05,
            help="Classifier-free guidance. Higher sticks closer to the reference voice; lower allows more variation.",
            group="advanced",
        ),
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
    ) -> tuple[bytes, int, int]:
        if self._model is None:
            raise RuntimeError("model not loaded")
        seed_used = apply_seed(params.get("seed"))
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
