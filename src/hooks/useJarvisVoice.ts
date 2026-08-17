import { useState, useRef, useCallback, useEffect } from 'react';
import { PCM_WORKLET_CODE } from './pcm-processor.worklet';

import { getVoiceWebSocketUrl, getVoiceToken } from '../services/voiceOsService.js';

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

  const isDisposed = useRef(false);

  const stop = useCallback(() => {
    isDisposed.current = true;
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
    isDisposed.current = false;
    try {
      // Build the WS URL at connection time so we pick up the current session
      // token. Voice OS rejects connections that don't carry the correct token
      // in the query string, preventing same-machine web pages from hijacking
      // the microphone/TTS pipeline.
      const baseUrl = getVoiceWebSocketUrl();
      let wsUrl = baseUrl;
      try {
        const token = await getVoiceToken();
        // Use the URL constructor so existing query params on baseUrl are preserved
        // and the token value is properly percent-encoded.
        const url = new URL(baseUrl);
        url.searchParams.set('token', token);
        wsUrl = url.toString();
      } catch {
        // Voice OS not running yet — proceed without token; the server will
        // close the connection immediately and the user will see the normal
        // "not running" error toast.
      }
      const socket = new WebSocket(wsUrl);
      if (isDisposed.current) return;
      socket.binaryType = 'arraybuffer';
      ws.current = socket;

      socket.onopen = () => { if (!isDisposed.current) setIsConnected(true); };
      socket.onclose = () => {
        if (isDisposed.current) return;
        setIsConnected(false);
        setVoiceState('idle');
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'info', message: 'Voice OS disconnected. Start it from Runtimes tab to use voice.' }
        }));
      };
      socket.onerror = () => {
        if (isDisposed.current) return;
        setError('WebSocket connection failed');
        setVoiceState('error');
        window.dispatchEvent(new CustomEvent('alphonso:toast', {
          detail: { type: 'error', message: 'Voice OS not running - start it from Runtime Manager to use voice.' }
        }));
      };

      socket.onmessage = (e: MessageEvent) => {
        if (isDisposed.current) return;
        if (e.data instanceof ArrayBuffer) {
          // TTS audio: decode WAV bytes and play through speakers
          const playCtx = audioCtx.current ?? new AudioContext();
          playCtx.decodeAudioData(e.data.slice(0)).then(buf => {
            if (isDisposed.current) return;
            const src = playCtx.createBufferSource();
            src.buffer = buf;
            src.connect(playCtx.destination);
            src.start();
          }).catch(() => {/* ignore decode errors on partial chunks */});
          return;
        }
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data);
          if (isDisposed.current) return;
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
      if (isDisposed.current) { mediaStream.getTracks().forEach(t => t.stop()); return; }
      stream.current = mediaStream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      if (isDisposed.current) { ctx.close(); mediaStream.getTracks().forEach(t => t.stop()); return; }
      audioCtx.current = ctx;

      // Register worklet from blob URL
      const blob = new Blob([PCM_WORKLET_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      if (isDisposed.current) { ctx.close(); return; }

      const src = ctx.createMediaStreamSource(mediaStream);
      const node = new AudioWorkletNode(ctx, 'pcm-processor');
      if (isDisposed.current) { node.disconnect(); return; }
      workletNode.current = node;

      node.port.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
        if (isDisposed.current) return;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(evt.data);
        }
      };

      src.connect(node);
      // Don't connect to destination (avoids echo)

      if (isDisposed.current) return;
      setVoiceState('listening');
    } catch (err) {
      if (isDisposed.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setVoiceState('error');
      stop();
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, reset, state: voiceState, transcript, reply, activeAgent, error, isConnected };
}
