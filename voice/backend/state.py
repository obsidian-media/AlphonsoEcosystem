from enum import Enum
from typing import Dict

class VoiceState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"

_states: Dict[str, VoiceState] = {}


def get_state(session_id: str) -> VoiceState:
    return _states.get(session_id, VoiceState.IDLE)


def set_state(session_id: str, state: str | VoiceState) -> None:
    _states[session_id] = VoiceState(state)


def remove_state(session_id: str) -> None:
    _states.pop(session_id, None)
