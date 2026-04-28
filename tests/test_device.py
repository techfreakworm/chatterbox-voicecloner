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
