// Agent phase 4: Simple mode suggests what Sentinel can actually do (he can't see your settings).
import { describe, it, expect } from 'vitest';
import { getCompanionContent } from '../../services/companionGreetingsService';

describe("Sentinel's quick starts", () => {
  it('are things he can do', () => {
    const { quickStarts } = getCompanionContent('sentinel');
    expect(quickStarts.join(' ')).not.toMatch(/settings/i);
    expect(quickStarts).toContain('Check this text for anything unsafe...');
    expect(quickStarts).toContain('Check this link before I open it...');
  });
});
