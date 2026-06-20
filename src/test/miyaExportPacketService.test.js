import { describe, expect, it } from 'vitest';
import { buildMiyaExportPacket } from '../services/miyaExportPacketService';

describe('miya export packet service', () => {
  it('standardizes creative export packet metadata', () => {
    const packet = buildMiyaExportPacket({
      exportType: 'youtube_publish_handoff',
      title: 'Launch trailer',
      topic: 'Launch trailer',
      summary: 'Publish handoff',
      artifactPaths: ['C:/video/final.mp4'],
      target: 'youtube',
      privacyStatus: 'private',
      metadata: { tags: ['launch'] }
    });

    expect(packet.exportVersion).toBe('1.0.0');
    expect(packet.exportType).toBe('youtube_publish_handoff');
    expect(packet.artifactPaths).toEqual(['C:/video/final.mp4']);
    expect(packet.metadata.tags).toEqual(['launch']);
  });
});
