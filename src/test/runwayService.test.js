import { describe, expect, it } from 'vitest';
import { buildRunwayVideoRequest } from '../services/runwayService';

describe('buildRunwayVideoRequest', () => {
  it('normalizes the runway request payload', () => {
    const request = buildRunwayVideoRequest({
      promptText: '  Launch teaser  ',
      model: ' gen4.5 ',
      ratio: ' 1280:720 ',
      duration: '6',
      outputDir: ' release/miya/runway ',
      timeoutSeconds: '900'
    });

    expect(request).toEqual({
      promptText: 'Launch teaser',
      promptImage: '',
      model: 'gen4.5',
      ratio: '1280:720',
      duration: 6,
      outputDir: 'release/miya/runway',
      timeoutSeconds: 900
    });
  });

  it('keeps the default runway video settings stable', () => {
    expect(buildRunwayVideoRequest()).toEqual({
      promptText: '',
      promptImage: '',
      model: 'gen4.5',
      ratio: '1280:720',
      duration: 5,
      outputDir: '',
      timeoutSeconds: 600
    });
  });
});
