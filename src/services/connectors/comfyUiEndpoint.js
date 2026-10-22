// ComfyUI's address, in one place. Settings → Runtime → ComfyUI sets it; every
// caller reads it from here. Until 2026-10-22 six places used a fixed
// http://127.0.0.1:8188 and nothing in the app could set the saved address.
// Kept in its own module because connectorRegistry.js and
// connectorImageGenerators.js both need it and import each other.

export const DEFAULT_COMFYUI_ENDPOINT = 'http://127.0.0.1:8188';
export const COMFYUI_ENDPOINT_KEY = 'alphonso_comfyui_endpoint_v1';

/** The address set in Settings, else the default. */
export function getComfyUiEndpoint() {
  try {
    const configured = localStorage.getItem(COMFYUI_ENDPOINT_KEY);
    return String(configured || DEFAULT_COMFYUI_ENDPOINT).replace(/\/+$/, '');
  } catch {
    return DEFAULT_COMFYUI_ENDPOINT;
  }
}

/** Save ComfyUI's address; '' goes back to the default. */
export function setComfyUiEndpoint(value) {
  try {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (trimmed) localStorage.setItem(COMFYUI_ENDPOINT_KEY, trimmed);
    else localStorage.removeItem(COMFYUI_ENDPOINT_KEY);
  } catch { /* storage unavailable */ }
}
