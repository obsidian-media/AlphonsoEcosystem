"""Speak a content-factory script with Kokoro (Miya Studio, phase 2a).

Run by the app's backend (`content_tts_kokoro`) with the Kokoro tool's own
Python from Runtime Hub. The lines come in a JSON job file, never on the
command line, so no text can be read as an argument:

    python kokoro_speak.py --job job.json --model kokoro-v1.0.onnx --voices voices-v1.0.bin

job.json: {"voice": "af_heart", "speed": 1.0, "outDir": "...", "lines": [{"id": "s1", "text": "..."}]}

Prints one JSON line: {"ok": true, "files": [{"id", "path", "durationSec"}]}.
A line with no words gets no file and a duration of 0.
"""
import argparse
import json
import sys
import wave
from pathlib import Path


def lang_for_voice(voice):
    """Kokoro voice ids start with the accent: a = American, b = British English."""
    return 'en-gb' if voice.startswith('b') else 'en-us'


def write_wav(path, samples, rate):
    """Writes 16-bit mono PCM without needing soundfile."""
    frames = bytearray()
    for value in samples:
        clipped = max(-1.0, min(1.0, float(value)))
        frames += int(clipped * 32767).to_bytes(2, 'little', signed=True)
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(bytes(frames))


def default_kokoro(model, voices):
    from kokoro_onnx import Kokoro  # imported here so the tests need no model
    return Kokoro(model, voices)


def run(job_path, model, voices, make_kokoro=default_kokoro):
    job = json.loads(Path(job_path).read_text(encoding='utf-8'))
    voice = str(job['voice'])
    speed = float(job.get('speed') or 1.0)
    out_dir = Path(job['outDir'])
    out_dir.mkdir(parents=True, exist_ok=True)
    kokoro = None
    files = []
    for line in job['lines']:
        text = str(line.get('text') or '').strip()
        line_id = str(line['id'])
        if not text:
            files.append({'id': line_id, 'path': None, 'durationSec': 0.0})
            continue
        if kokoro is None:
            kokoro = make_kokoro(model, voices)
        samples, rate = kokoro.create(text, voice=voice, speed=speed, lang=lang_for_voice(voice))
        path = out_dir / f'{line_id}.wav'
        write_wav(path, samples, rate)
        files.append({'id': line_id, 'path': str(path), 'durationSec': round(len(samples) / rate, 3)})
    return {'ok': True, 'files': files}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--voices', required=True)
    args = parser.parse_args(argv)
    try:
        result = run(args.job, args.model, args.voices)
    except Exception as error:  # reported to the app as the step's reason
        result = {'ok': False, 'error': f'Kokoro could not speak the script: {error}'}
    print(json.dumps(result))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
