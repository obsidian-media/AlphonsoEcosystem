"""Tests for the MusicGen script (Miya content factory, phase 2a)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import musicgen_generate  # noqa: E402


class FakeModel:
    """Stands in for MusicGen: records what it was asked."""

    sample_rate = 32000
    asked = {}

    def set_generation_params(self, duration):
        FakeModel.asked['duration'] = duration

    def generate(self, prompts):
        FakeModel.asked['prompts'] = prompts
        return ['WAVE']


def fake_write(stem, wave, rate):
    Path(f'{stem}.wav').write_bytes(b'RIFF')
    FakeModel.asked['rate'] = rate


def test_makes_one_music_bed_of_the_asked_length(tmp_path):
    job = tmp_path / 'job.json'
    out = tmp_path / 'audio' / 'music-v1.wav'
    job.write_text(json.dumps({'prompt': 'calm lo-fi piano', 'seconds': 42, 'outPath': str(out)}), encoding='utf-8')
    result = musicgen_generate.run(str(job), load_model=lambda: FakeModel(), write_audio=fake_write, device='cpu')
    assert result == {'ok': True, 'path': str(out), 'durationSec': 42.0, 'device': 'cpu'}
    assert FakeModel.asked == {'duration': 42.0, 'prompts': ['calm lo-fi piano'], 'rate': 32000}
    assert out.exists()


def test_length_is_kept_between_5_and_300_seconds(tmp_path):
    assert musicgen_generate.clamp_seconds(1) == 5.0
    assert musicgen_generate.clamp_seconds(900) == 300.0
    assert musicgen_generate.clamp_seconds('x') == 30.0
