// Web Monitor — main tool entrypoint
// Fetches configured URLs and reports content changes

export async function run(context = {}) {
  const { urls = [], previousSnapshots = {} } = context;
  console.log('[web_monitor] run called with', urls.length, 'URLs');

  const results = [];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await resp.text();
      const previous = previousSnapshots[url] || '';
      const changed = text !== previous;
      results.push({ url, changed, length: text.length });
      if (changed) {
        console.log('[web_monitor] change detected at', url);
      }
    } catch (err) {
      results.push({ url, changed: false, error: String(err.message || err) });
    }
  }

  return { results, checkedAt: new Date().toISOString() };
}
