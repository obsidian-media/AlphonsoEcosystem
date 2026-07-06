import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse } from '../lib/ollama.js';
import { pushMemoryItem } from './memoryService.js';

export async function transcribeAndIngest(
  audioFilePath: string,
  filename: string,
  onProgress?: (phase: string) => void
): Promise<{ transcript: string; summary: string }> {
  onProgress?.('transcribing');
  const transcript: string = await invoke('transcribe_audio_file', {
    audioPath: audioFilePath,
    model: 'base',
  });

  if (!transcript?.trim()) throw new Error('Whisper returned empty transcript');

  onProgress?.('summarizing');
  const prompt = `Extract the key information from this meeting transcript into concise bullet points covering:
1. Key decisions made
2. Action items and owners
3. Main topics discussed
4. Important numbers, dates, or deadlines

Transcript:
${transcript.slice(0, 6000)}

Format as short bullet points only.`;

  const summary = await (generateOllamaResponse as (opts: { prompt: string }) => Promise<{ response: string; done: boolean }>)({ prompt }).catch(() => null);
  const summaryText = summary?.response?.trim() || transcript.slice(0, 800);

  onProgress?.('saving');
  pushMemoryItem({
    title: `Meeting: ${filename}`,
    category: 'meeting_transcript',
    content: {
      synthesis: summaryText,
      filename,
      transcriptPreview: transcript.slice(0, 1000),
    },
    source: `meeting-transcript:${filename}`,
    sourceAgent: 'echo',
    confidence: 'inferred',
    verificationState: 'unverified',
  });

  return { transcript, summary: summaryText };
}