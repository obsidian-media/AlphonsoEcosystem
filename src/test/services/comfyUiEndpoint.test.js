import { describe, it, expect, beforeEach } from 'vitest';
import { COMFYUI_ENDPOINT_KEY, DEFAULT_COMFYUI_ENDPOINT, getComfyUiEndpoint, setComfyUiEndpoint } from '../../services/connectors/comfyUiEndpoint.js';

// QA 2026-10-22: six places used a fixed 127.0.0.1:8188 and nothing could set
// the saved address. Settings → Runtime → ComfyUI now sets it.
describe('comfyUiEndpoint', () => {
  beforeEach(() => localStorage.clear());

  it('uses the default until an address is set', () => {
    expect(getComfyUiEndpoint()).toBe(DEFAULT_COMFYUI_ENDPOINT);
  });

  it('saves an address without a trailing slash, and clearing it goes back to the default', () => {
    setComfyUiEndpoint('  http://192.168.1.30:8189/  ');
    expect(localStorage.getItem(COMFYUI_ENDPOINT_KEY)).toBe('http://192.168.1.30:8189');
    expect(getComfyUiEndpoint()).toBe('http://192.168.1.30:8189');
    setComfyUiEndpoint('');
    expect(getComfyUiEndpoint()).toBe(DEFAULT_COMFYUI_ENDPOINT);
  });
});
