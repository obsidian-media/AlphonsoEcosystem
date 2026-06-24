import subprocess
import tempfile
import wave
import os

def transcribe(pcm: bytes):
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name

    with wave.open(path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm)

    cmd = ['./whisper.cpp/main', '-f', path, '-nt']
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    txt = path + '.txt'
    return open(txt).read().strip() if os.path.exists(txt) else ''
