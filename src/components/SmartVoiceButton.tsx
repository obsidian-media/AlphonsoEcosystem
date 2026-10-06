import React from 'react';
import { Mic, MicOff, AlertCircle, Zap } from 'lucide-react';
import { useJarvisVoice } from '../hooks/useJarvisVoice';
import { VOICE_STATES, TRANSCRIPTION_PIPELINE_STATUS } from '../services/voiceService';

interface Props {
  voiceStatus?: { state: string; message: string };
  onToggle?: () => void;
  onSmartToggle?: () => void;
}

export function SmartVoiceButton({ voiceStatus: browserVoiceStatus, onToggle, onSmartToggle }: Props) {
  const jarvis = useJarvisVoice();

  const isJarvisAvailable = jarvis.isConnected && jarvis.state !== 'error';
  const jarvisListening = jarvis.state === 'listening';
  const jarvisThinking = jarvis.state === 'thinking';
  const jarvisSpeaking = jarvis.state === 'speaking';
  const jarvisError = jarvis.state === 'error';

  const browserListening = browserVoiceStatus?.state === VOICE_STATES.LISTENING;
  const browserRequesting = browserVoiceStatus?.state === VOICE_STATES.REQUESTING_PERMISSION;
  const browserBlocked = [
    VOICE_STATES.PERMISSION_DENIED,
    VOICE_STATES.NO_MICROPHONE,
    VOICE_STATES.UNSUPPORTED,
    VOICE_STATES.ERROR
  ].includes(browserVoiceStatus?.state);
  const noTranscription = !TRANSCRIPTION_PIPELINE_STATUS.available;

  const isListening = isJarvisAvailable ? jarvisListening : browserListening;
  const isRequesting = isJarvisAvailable ? false : browserRequesting;
  const isBlocked = isJarvisAvailable ? jarvisError : browserBlocked;

  let label = 'VOICE';
  let modeIndicator = '';

  if (jarvisListening || jarvisThinking || jarvisSpeaking) {
    label = 'STOP';
    modeIndicator = jarvis.activeAgent !== 'alphonso_core' ? ` · ${jarvis.activeAgent}` : '';
  } else if (jarvisError) {
    label = 'VOICE';
  } else if (isJarvisAvailable) {
    label = 'VOICE (WS)';
  } else if (browserListening) {
    label = 'STOP';
  } else if (browserRequesting) {
    label = 'REQUESTING…';
  } else if (noTranscription) {
    label = 'VOICE (NO STT)';
  }

  const title = isJarvisAvailable
    ? `Jarvis voice via WebSocket${jarvis.activeAgent ? ` — optimized for ${jarvis.activeAgent}` : ''}`
    : noTranscription
      ? 'Microphone works but speech-to-text unavailable. Start Voice OS for full voice pipeline.'
      : browserVoiceStatus?.message || 'Browser-based voice input';

  const handleClick = () => {
    if (isJarvisAvailable) {
      if (jarvis.state === 'idle' || jarvis.state === 'error') jarvis.start();
      else jarvis.stop();
    } else if (onSmartToggle) {
      onSmartToggle();
    } else if (onToggle) {
      onToggle();
    }
  };

  return (
    <button
      onClick={handleClick}
      data-testid="smart-voice-button"
      disabled={isRequesting || browserVoiceStatus?.state === VOICE_STATES.UNSUPPORTED}
      className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-t-lg text-2xs font-bold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--accent-border) ${
        isListening || jarvisThinking || jarvisSpeaking
          ? 'border-(--accent) text-(--accent) bg-(--accent-muted)'
          : isJarvisAvailable
            ? 'border-(--success-border) text-(--success) hover:bg-(--success-muted)'
            : jarvisError
              ? 'border-(--warning-border) text-(--warning) hover:bg-(--warning-dim)'
              : 'border-(--border) text-(--text-3) hover:text-(--text-1)'
      }`}
      title={title}
    >
      {isListening ? <MicOff className="w-3 h-3" /> : isJarvisAvailable && !jarvisError ? <Zap className="w-3 h-3" /> : noTranscription ? <AlertCircle className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
      {label}
      {modeIndicator && <span className="text-3xs opacity-70">{modeIndicator}</span>}
    </button>
  );
}