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

class UtteranceCollector:
    """Collects streamed 16 kHz 16-bit mono audio into whole utterances.

    QA 2026-10-22: the server used to cut the stream every 1.5 s and answer each
    piece on its own, so one sentence ("What is two plus three? Please answer in
    one short sentence.") became four half-questions. An utterance now starts at
    the first speech, keeps a little audio from just before it, and ends after
    ``end_silence_ms`` of silence, or at ``max_ms`` so a long monologue still
    gets answered.
    """

    FRAME_MS = 30
    FRAME_BYTES = int(16000 * FRAME_MS / 1000) * 2

    def __init__(self, end_silence_ms: int = 700, pre_roll_ms: int = 300, max_ms: int = 15000, aggressiveness: int = 2, classify=None):
        self._vad = webrtcvad.Vad(aggressiveness)
        # classify(frame) -> bool; tests pass their own to mark frames as speech.
        self._classify = classify
        self._end_frames = max(1, end_silence_ms // self.FRAME_MS)
        self._pre_frames = max(0, pre_roll_ms // self.FRAME_MS)
        self._max_frames = max(1, max_ms // self.FRAME_MS)
        self._pending = b""
        self._pre_roll: collections.deque = collections.deque(maxlen=self._pre_frames or 1)
        self._utterance: list[bytes] = []
        self._silent_frames = 0

    @property
    def in_utterance(self) -> bool:
        return bool(self._utterance)

    def reset(self) -> None:
        self._pending = b""
        self._pre_roll.clear()
        self._utterance = []
        self._silent_frames = 0

    def feed(self, raw: bytes) -> list[bytes]:
        """Add audio; return every utterance completed by it (usually none or one)."""
        done: list[bytes] = []
        data = self._pending + raw
        usable = len(data) - (len(data) % self.FRAME_BYTES)
        self._pending = data[usable:]
        for offset in range(0, usable, self.FRAME_BYTES):
            frame = data[offset:offset + self.FRAME_BYTES]
            try:
                speech = self._classify(frame) if self._classify else self._vad.is_speech(frame, 16000)
            except struct.error:
                speech = False
            if not self._utterance:
                if speech:
                    self._utterance = [*self._pre_roll, frame] if self._pre_frames else [frame]
                    self._pre_roll.clear()
                    self._silent_frames = 0
                elif self._pre_frames:
                    self._pre_roll.append(frame)
                continue
            self._utterance.append(frame)
            self._silent_frames = 0 if speech else self._silent_frames + 1
            if self._silent_frames >= self._end_frames or len(self._utterance) >= self._max_frames:
                done.append(b"".join(self._utterance))
                self._utterance = []
                self._silent_frames = 0
        return done
