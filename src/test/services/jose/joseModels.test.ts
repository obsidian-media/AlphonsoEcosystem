import { describe, it, expect } from 'vitest';
import { modelSize, pickLargerModel } from '../../../services/jose/joseModels';

describe('joseModels', () => {
  it("reads a model's size from its tag", () => {
    expect(modelSize('qwen2.5:7b')).toBe(7);
    expect(modelSize('qwen3:0.6b')).toBe(0.6);
    expect(modelSize('llama3.2:latest')).toBeNull();
    expect(modelSize('qwen2.5-coder:14b-instruct')).toBe(14);
  });

  it('picks the smallest installed model larger than the current one', () => {
    const installed = ['qwen3:0.6b', 'llama3.2:3b', 'qwen2.5:7b', 'qwen2.5:14b'];
    expect(pickLargerModel('llama3.2:3b', installed)).toBe('qwen2.5:7b');
    expect(pickLargerModel('qwen2.5:14b', installed)).toBeNull();
    expect(pickLargerModel('llama3.2:latest', installed)).toBeNull();
  });
});
