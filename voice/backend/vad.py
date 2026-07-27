import webrtcvad
import struct
import collections
def _iter_frames(pcm_bytes: bytes, sample_rate: int = 16000, frame_duration_ms: int = 30):
    frame_size = int(sample_rate * frame_duration_ms / 1000) * 2
    if frame_size == 0:
        return
    remainder = len(pcm_bytes) % frame_size
    if remainder != 0:
        pcm_bytes = pcm_bytes + b'\x00' * (frame_size - remainder)
    for offset in range(0, len(pcm_bytes) - frame_size + 1, frame_size):
        frame = pcm_bytes[offset:offset + frame_size]
        if len(frame) == frame_size:
            yield frame


def is_speech(pcm_bytes: bytes, sample_rate: int = 16000, frame_duration_ms: int = 30) -> bool:
    if not pcm_bytes or len(pcm_bytes) < 2:
        return False

    vad = webrtcvad.Vad(2)

    speech_frames = 0
    total_frames = 0

    for frame in _iter_frames(pcm_bytes, sample_rate, frame_duration_ms):
        try:
            if vad.is_speech(frame, sample_rate):
                speech_frames += 1
        except struct.error:
            pass
        total_frames += 1

    if total_frames == 0:
        return False

    return speech_frames / total_frames > 0.3


def voice_activity_level(pcm_bytes: bytes) -> float:
    if not pcm_bytes or len(pcm_bytes) < 2:
        return 0.0

    vad = webrtcvad.Vad(2)
    speech_frames = 0
    total_frames = 0

    for frame in _iter_frames(pcm_bytes):
        try:
            if vad.is_speech(frame, 16000):
                speech_frames += 1
        except struct.error:
            pass
        total_frames += 1

    if total_frames == 0:
        return 0.0
    return min(1.0, speech_frames / total_frames)