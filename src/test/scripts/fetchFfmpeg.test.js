import { describe, it, expect } from 'vitest';
import { FFMPEG_ASSET, KEEP_FILE } from '../../../scripts/fetch-ffmpeg.mjs';

// Miya content factory phase 2a (owner): ffmpeg is bundled in the installer,
// an LGPL build only, pinned to a dated release with its checksum.
describe('fetch-ffmpeg', () => {
  it('pins a dated LGPL win64 build and its SHA-256', () => {
    expect(FFMPEG_ASSET.url).toMatch(/^https:\/\/github\.com\/BtbN\/FFmpeg-Builds\/releases\/download\/autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\//);
    expect(FFMPEG_ASSET.url).toMatch(/win64-lgpl-shared-\d+\.\d+\.zip$/);
    expect(FFMPEG_ASSET.url).not.toMatch(/latest/);
    expect(FFMPEG_ASSET.url).not.toMatch(/-gpl-/);
    expect(FFMPEG_ASSET.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps ffmpeg, ffprobe, their libraries and the license, not ffplay', () => {
    expect(KEEP_FILE('ffmpeg-x/bin/ffmpeg.exe')).toBe('ffmpeg.exe');
    expect(KEEP_FILE('ffmpeg-x/bin/ffprobe.exe')).toBe('ffprobe.exe');
    expect(KEEP_FILE('ffmpeg-x/bin/avcodec-62.dll')).toBe('avcodec-62.dll');
    expect(KEEP_FILE('ffmpeg-x/LICENSE.txt')).toBe('LICENSE.txt');
    expect(KEEP_FILE('ffmpeg-x/bin/ffplay.exe')).toBeNull();
    expect(KEEP_FILE('ffmpeg-x/include/libavcodec/avcodec.h')).toBeNull();
    expect(KEEP_FILE('ffmpeg-x/lib/avcodec.lib')).toBeNull();
  });
});
