import { useState, useRef, useCallback } from 'react';
import { PCM_WORKLET_CODE } from './pcm-processor.worklet';

import { getVoiceWebSocketUrl } from '../services/voiceOsService.js';
const WS_URL = getVoiceWebSocketUrl();

export interface JarvisVoiceState {
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  transcript: string;
  reply: string;
  activeAgent: string;
  error: string | null;
  isConnected: boolean;
}

export function useJarvisVoice() {
  const ws = useRef<WebSocket | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const [voiceState, setVoiceState] = useState<JarvisVoiceState['state']>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [activeAgent, setActiveAgent] = useState('alphonso_core');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const stop = useCallback(() => {
    workletNode.current?.disconnect();
    workletNode.current = null;

    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;

    audioCtx.current?.close();
    audioCtx.current = null;

    ws.current?.close();
    ws.current = null;

    setIsConnected(false);
    setVoiceState('idle');
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setReply('');
    setActiveAgent('alphonso_core');
    setError(null);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'reset' }));
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const socket = new WebSocket(WS_URL);
      socket.binaryType = 'arraybuffer';
      ws.current = socket;

      socket.onopen = () => setIsConnected(true);
      socket.onclose = () => {
        setIsConnected(false);
        setVoiceState('idle');
      };
      socket.onerror = () => {
        setError('WebSocket connection failed');
        setVoiceState('error');
      };

      socket.onmessage = (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          // TTS audio: decode WAV bytes and play through speakers
          const playCtx = audioCtx.current ?? new AudioContext();
          playCtx.decodeAudioData(e.data.slice(0)).then(buf => {
            const src = playCtx.createBufferSource();
            src.buffer = buf;
            src.connect(playCtx.destination);
            src.start();
          }).catch(() => {/* ignore decode errors on partial chunks */});
          return;
        }
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data);
          if (msg.type === 'stt') setTranscript(msg.text);
          if (msg.type === 'llm') setReply(prev => prev + msg.text);
          if (msg.type === 'state') setVoiceState(msg.value);
          if (msg.type === 'agent') setActiveAgent(msg.name);
          if (msg.type === 'error') {
            setError(msg.message);
            setVoiceState('error');
          }
        }
      };

      // AudioWorklet setup
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = mediaStream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtx.current = ctx;

      // Register worklet from blob URL
      const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const src = ctx.createMediaStreamSource(mediaStream);
      const node = new AudioWorkletNode(ctx, 'pcm-processor');
      workletNode.current = node;

      node.port.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(evt.data);
        }
      };

      src.connect(node);
      // Don't connect to destination (avoids echo)

      setVoiceState('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setVoiceState('error');
      stop();
    }
  }, [stop]);

  return { start, stop, reset, state: voiceState, transcript, reply, activeAgent, error, isConnected };
}
