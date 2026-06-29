import webrtcvad
import struct
import collections

def is_speech(pcm_bytes: bytes, sample_rate: int = 16000, frame_duration_ms: int = 30) -> bool:
    """
    Detect voice activity using WebRTC VAD.
    
    Args:
        pcm_bytes: Raw 16-bit mono PCM audio
        sample_rate: Audio sample rate (default 16kHz)
        frame_duration_ms: Frame size (10, 20, or 30 ms)
    
    Returns:
        True if speech detected, False for silence
    """
    if not pcm_bytes or len(pcm_bytes) < 2:
        return False
    
    vad = webrtcvad.Vad(2)  # Aggressiveness level 2 (medium)
    
    frame_size = int(sample_rate * frame_duration_ms / 1000) * 2  # bytes per frame
    if frame_size == 0:
        return False
    
    # Pad to multiple of frame size
    remainder = len(pcm_bytes) % frame_size
    if remainder != 0:
        pcm_bytes = pcm_bytes + b'\x00' * (frame_size - remainder)
    
    # Process each frame
    speech_frames = 0
    total_frames = 0
    
    for offset in range(0, len(pcm_bytes) - frame_size + 1, frame_size):
        frame = pcm_bytes[offset:offset + frame_size]
        if len(frame) == frame_size:
            try:
                if vad.is_speech(frame, sample_rate):
                    speech_frames += 1
            except struct.error:
                pass
            total_frames += 1
    
    if total_frames == 0:
        return False
    
    # Speech if >30% of frames contain speech
    return speech_frames / total_frames > 0.3

def voice_activity_level(pcm_bytes: bytes) -> float:
    """Return speech ratio as float 0.0-1.0 for backward compatibility."""
    if not pcm_bytes or len(pcm_bytes) < 2:
        return 0.0
    
    vad = webrtcvad.Vad(2)
    frame_duration_ms = 30
    sample_rate = 16000
    frame_size = int(sample_rate * frame_duration_ms / 1000) * 2
    
    remainder = len(pcm_bytes) % frame_size
    if remainder != 0:
        pcm_bytes = pcm_bytes + b'\x00' * (frame_size - remainder)
    
    speech_frames = 0
    total_frames = 0
    
    for offset in range(0, len(pcm_bytes) - frame_size + 1, frame_size):
        frame = pcm_bytes[offset:offset + frame_size]
        if len(frame) == frame_size:
            try:
                if vad.is_speech(frame, sample_rate):
                    speech_frames += 1
            except struct.error:
                pass
            total_frames += 1
    
    if total_frames == 0:
        return 0.0
    return min(1.0, speech_frames / total_frames)