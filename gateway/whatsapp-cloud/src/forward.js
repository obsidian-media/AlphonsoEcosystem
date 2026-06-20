export async function forwardNormalizedPacket({ forwardUrl, packet, allowlist = [], timeoutMs = 5000 }) {
  if (!forwardUrl) {
    return { ok: false, reason: 'forward_url_missing', status: 'setup_required' };
  }

  const sender = String(packet?.from || '').trim();
  if (allowlist.length > 0 && !sender) {
    return { ok: false, reason: 'sender_missing', status: 'blocked' };
  }
  if (allowlist.length > 0 && sender && !allowlist.includes(sender)) {
    return { ok: false, reason: 'sender_not_allowlisted', status: 'blocked' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(forwardUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(packet),
      signal: controller.signal
    });
    const preview = await response.text().catch(() => '');
    return {
      ok: response.ok,
      status: response.ok ? 'ready' : 'failed',
      httpStatus: response.status,
      responsePreview: preview.slice(0, 120)
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      reason: error?.name === 'AbortError' ? 'forward_timeout' : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}
