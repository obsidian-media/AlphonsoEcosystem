import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../../lib/ollama.js', () => ({
  generateOllamaResponse: vi.fn()
}));

vi.mock('../memoryService.js', () => ({
  pushMemoryItem: vi.fn()
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);

import { transcribeAndIngest } from '../../services/whisperTranscriptionService';
import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse } from '../../lib/ollama.js';
import { pushMemoryItem } from '../memoryService.js';

describe('whisperTranscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls transcribe_audio_file Tauri command', async () => {
    invoke.mockResolvedValueOnce('transcript text');
    generateOllamaResponse.mockResolvedValueOnce({ response: 'summary' });
    
    await transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', vi.fn());
    
    expect(invoke).toHaveBeenCalledWith('transcribe_audio_file', {
      audioPath: '/path/to/audio.wav',
      model: 'base'
    });
  });

  it('throws on empty transcript', async () => {
    invoke.mockResolvedValueOnce('');
    
    await expect(transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', vi.fn()))
      .rejects.toThrow('Whisper returned empty transcript');
  });

  it('calls Ollama summary when transcript exists', async () => {
    invoke.mockResolvedValueOnce('transcript text');
    generateOllamaResponse.mockResolvedValueOnce({ response: 'summary text' });
    
    await transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', vi.fn());
    
    expect(generateOllamaResponse).toHaveBeenCalled();
  });

  it('uses transcript as fallback when Ollama fails', async () => {
    invoke.mockResolvedValueOnce('transcript text');
    generateOllamaResponse.mockRejectedValueOnce(new Error('Ollama offline'));
    
    const result = await transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', vi.fn());
    
    expect(result.transcript).toBe('transcript text');
    expect(result.summary).toBe('transcript text');
  });

  it('calls pushMemoryItem with correct structure', async () => {
    invoke.mockResolvedValueOnce('transcript text');
    generateOllamaResponse.mockResolvedValueOnce({ response: 'summary' });
    
    await transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', vi.fn());
    
    expect(pushMemoryItem).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Meeting: meeting.wav',
      category: 'meeting_transcript',
      source: 'meeting-transcript:meeting.wav',
      sourceAgent: 'echo'
    }));
  });

  it('invokes progress callbacks for each stage', async () => {
    invoke.mockResolvedValueOnce('transcript text');
    generateOllamaResponse.mockResolvedValueOnce({ response: 'summary' });
    
    const onProgress = vi.fn();
    await transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', onProgress);
    
    expect(onProgress).toHaveBeenCalledWith('transcribing');
    expect(onProgress).toHaveBeenCalledWith('summarizing');
    expect(onProgress).toHaveBeenCalledWith('saving');
  });

  it('truncates transcript for summary prompt', async () => {
    const longTranscript = 'x'.repeat(7000);
    invoke.mockResolvedValueOnce(longTranscript);
    generateOllamaResponse.mockResolvedValueOnce({ response: 'summary' });
    
    await transcribeAndIngest('/path/to/audio.wav', 'meeting.wav', vi.fn());
    
    const promptArg = generateOllamaResponse.mock.calls[0][0];
    expect(promptArg.prompt.length).toBeLessThan(longTranscript.length + 200);
  });
});