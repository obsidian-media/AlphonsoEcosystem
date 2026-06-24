import subprocess
import tempfile

def synthesize(text: str) -> bytes:
    out = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    out.close()

    p = subprocess.Popen(
        ['piper', '--output_file', out.name],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE
    )

    p.communicate(input=text.encode())
    return open(out.name, 'rb').read()
