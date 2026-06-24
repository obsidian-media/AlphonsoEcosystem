import { useState, useRef } from 'react';

export function useJarvisVoice() {
  const ws = useRef<WebSocket | null>(null);

  const [state, setState] = useState('idle');
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');

  const start = async () => {
    const socket = new WebSocket('ws://localhost:8000/ws');
    socket.binaryType = 'arraybuffer';
    ws.current = socket;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();

    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);

    proc.onaudioprocess = e => {
      const input = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);

      for (let i = 0; i < input.length; i++) {
        pcm[i] = input[i] * 0x7fff;
      }

      if (socket.readyState === 1) socket.send(pcm.buffer);
    };

    src.connect(proc);
    proc.connect(ctx.destination);

    socket.onmessage = e => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data);

        if (msg.type === 'stt') setText(msg.text);
        if (msg.type === 'llm') setReply(prev => prev + msg.text);
        if (msg.type === 'state') setState(msg.value);
      }
    };
  };

  return { start, state, text, reply };
}
