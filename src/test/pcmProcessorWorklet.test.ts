import { describe, expect, it } from 'vitest';
import { PCM_WORKLET_CODE } from '../hooks/pcm-processor.worklet';

describe('PCM_WORKLET_CODE', () => {
  it('exports a string', () => {
    expect(typeof PCM_WORKLET_CODE).toBe('string');
  });

  it('contains PcmProcessor class', () => {
    expect(PCM_WORKLET_CODE).toContain('class PcmProcessor');
  });

  it('contains process method', () => {
    expect(PCM_WORKLET_CODE).toContain('process(inputs)');
  });

  it('contains registerProcessor call', () => {
    expect(PCM_WORKLET_CODE).toContain("registerProcessor('pcm-processor', PcmProcessor)");
  });

  it('contains Int16Array conversion', () => {
    expect(PCM_WORKLET_CODE).toContain('Int16Array');
  });

  it('contains port.postMessage', () => {
    expect(PCM_WORKLET_CODE).toContain('this.port.postMessage');
  });

  it('clamps values to 16-bit range', () => {
    expect(PCM_WORKLET_CODE).toContain('-32768');
    expect(PCM_WORKLET_CODE).toContain('32767');
  });

  it('returns true to keep processor alive', () => {
    expect(PCM_WORKLET_CODE).toContain('return true');
  });
});
