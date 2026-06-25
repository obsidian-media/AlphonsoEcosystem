import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse } from '../lib/ollama.js';
import { synthesizeMemory } from './echoMemoryService.js';

export async function transcribeAndIngest(audioFilePath, filename, onProgress) {
  onProgress?.('transcribing');
  const transcript = await invoke('transcribe_audio_file', {
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

  const summary = await generateOllamaResponse({ prompt }).catch(() => null);
  const summaryText = summary?.response?.trim() || transcript.slice(0, 800);

  onProgress?.('saving');
  await synthesizeMemory(
    `MEETING TRANSCRIPT — ${filename}\n\nSUMMARY:\n${summaryText}\n\nFULL TRANSCRIPT:\n${transcript.slice(0, 2000)}`,
    `meeting-transcript:${filename}`
  );

  return { transcript, summary: summaryText };
}
