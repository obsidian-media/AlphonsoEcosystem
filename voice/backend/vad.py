def voice_activity_level(pcm_bytes: bytes) -> float:
    # lightweight energy heuristic (replace with real VAD later)
    if not pcm_bytes:
        return 0.0
    energy = sum(abs(b) for b in pcm_bytes[-1000:]) / 1000
    return min(1.0, energy / 1000)
