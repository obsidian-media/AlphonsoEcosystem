"""Make a music bed with MusicGen (Miya Studio, phase 2a).

Run by the app's backend (`content_music_generate`) with AudioCraft's own
Python from Runtime Hub. The prompt comes in a JSON job file, never on the
command line:

    python musicgen_generate.py --job job.json

job.json: {"prompt": "calm lo-fi piano", "seconds": 45, "outPath": ".../music-v1.wav"}

Prints one JSON line: {"ok": true, "path", "durationSec", "device"}. MusicGen
small runs on the graphics card when there is one, else on the processor
(slow); "device" says which.
"""
import argparse
import json
import sys
from pathlib import Path

MODEL_NAME = 'facebook/musicgen-small'


def clamp_seconds(value):
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return 30.0
    return max(5.0, min(300.0, seconds))


def pick_device():
    try:
        import torch
        return 'cuda' if torch.cuda.is_available() else 'cpu'
    except Exception:
        return 'cpu'


def default_model():
    from audiocraft.models import MusicGen  # imported here so the tests need no model
    return MusicGen.get_pretrained(MODEL_NAME)


def default_write(stem, wave, rate):
    from audiocraft.data.audio import audio_write
    audio_write(stem, wave.cpu(), rate, strategy='loudness', loudness_compressor=True)


def run(job_path, load_model=default_model, write_audio=default_write, device=None):
    job = json.loads(Path(job_path).read_text(encoding='utf-8'))
    prompt = str(job.get('prompt') or '').strip()[:300]
    if not prompt:
        return {'ok': False, 'error': 'The music needs a short description.'}
    seconds = clamp_seconds(job.get('seconds'))
    out = Path(job['outPath'])
    out.parent.mkdir(parents=True, exist_ok=True)
    model = load_model()
    model.set_generation_params(duration=seconds)
    waves = model.generate([prompt])
    # audio_write adds the ".wav" itself.
    write_audio(str(out.with_suffix('')), waves[0], model.sample_rate)
    return {'ok': True, 'path': str(out), 'durationSec': seconds, 'device': device or pick_device()}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', required=True)
    args = parser.parse_args(argv)
    try:
        result = run(args.job)
    except Exception as error:  # reported to the app as the step's reason
        result = {'ok': False, 'error': f'MusicGen could not make the music: {error}'}
    print(json.dumps(result))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())
