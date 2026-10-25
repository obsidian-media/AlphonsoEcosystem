// News feeds as the search chain's last resort (agent phase 1). A thin wrapper
// so the chain doesn't import Hector's research service, which imports it.
export async function searchFeeds(query: string, limit: number): Promise<{ url?: string; title?: string; snippet?: string; summary?: string }[]> {
  const { fetchRssSources } = await import('../hectorResearchService');
  try {
    return (await fetchRssSources(query, limit)) || [];
  } catch {
    return [];
  }
}
