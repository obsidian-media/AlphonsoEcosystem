"""Tests for the Kokoro speak script (Miya content factory, phase 2a)."""
import json
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import kokoro_speak  # noqa: E402


class FakeKokoro:
    """Stands in for kokoro_onnx.Kokoro: half a second of silence per line."""

    calls = []

    def __init__(self, model, voices):
        self.model, self.voices = model, voices

    def create(self, text, voice, speed, lang):
        FakeKokoro.calls.append((text, voice, speed, lang))
        return [0.0] * 12000, 24000


def test_writes_one_wav_per_line_with_its_duration(tmp_path):
    job = tmp_path / 'job.json'
    job.write_text(json.dumps({
        'voice': 'af_heart', 'speed': 1.0, 'outDir': str(tmp_path / 'out'),
        'lines': [{'id': 's1', 'text': 'Hello there.'}, {'id': 's2', 'text': 'Second line: "quoted".'}],
    }), encoding='utf-8')
    FakeKokoro.calls = []
    result = kokoro_speak.run(str(job), 'model.onnx', 'voices.bin', make_kokoro=FakeKokoro)
    assert result['ok'] is True
    assert [f['id'] for f in result['files']] == ['s1', 's2']
    assert all(abs(f['durationSec'] - 0.5) < 0.01 for f in result['files'])
    with wave.open(result['files'][0]['path']) as w:
        assert w.getframerate() == 24000
    assert FakeKokoro.calls[1] == ('Second line: "quoted".', 'af_heart', 1.0, 'en-us')


def test_british_voices_speak_british_english(tmp_path):
    assert kokoro_speak.lang_for_voice('bf_emma') == 'en-gb'
    assert kokoro_speak.lang_for_voice('am_adam') == 'en-us'


def test_an_empty_line_gets_no_file(tmp_path):
    job = tmp_path / 'job.json'
    job.write_text(json.dumps({'voice': 'af_heart', 'speed': 1.0, 'outDir': str(tmp_path / 'out'),
                               'lines': [{'id': 's1', 'text': '   '}]}), encoding='utf-8')
    result = kokoro_speak.run(str(job), 'm', 'v', make_kokoro=FakeKokoro)
    assert result['files'] == [{'id': 's1', 'path': None, 'durationSec': 0.0, 'startSec': 0.0}]
    assert result['full'] is None


def test_one_full_track_with_each_line_start_and_silence_for_a_quiet_scene(tmp_path):
    job = tmp_path / 'job.json'
    job.write_text(json.dumps({'voice': 'af_heart', 'speed': 1.0, 'outDir': str(tmp_path / 'out'), 'lines': [
        {'id': 's1', 'text': 'Hello.'},
        {'id': 's2', 'text': '', 'pauseSec': 1.5},
        {'id': 's3', 'text': 'Bye.'},
    ]}), encoding='utf-8')
    result = kokoro_speak.run(str(job), 'm', 'v', make_kokoro=FakeKokoro)
    assert [(f['id'], f['startSec'], f['durationSec']) for f in result['files']] == [
        ('s1', 0.0, 0.5), ('s2', 0.5, 1.5), ('s3', 2.0, 0.5)]
    assert result['files'][1]['path'] is None
    assert abs(result['full']['durationSec'] - 2.5) < 0.01
    with wave.open(result['full']['path']) as w:
        assert w.getnframes() == 60000 and w.getframerate() == 24000
