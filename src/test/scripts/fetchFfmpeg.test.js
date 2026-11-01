import { describe, it, expect } from 'vitest';
import { FFMPEG_ASSET, FFMPEG_ASSETS, KEEP_FILE, KEEP_FILE_LINUX, platformArg, rpathCommands } from '../../../scripts/fetch-ffmpeg.mjs';

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

  // Closing phase (owner, 2026-10-30): the Linux AppImage bundles ffmpeg too.
  it('pins the same dated LGPL build for Linux, with its SHA-256', () => {
    const linux = FFMPEG_ASSETS.linux;
    expect(linux.url).toMatch(/^https:\/\/github\.com\/BtbN\/FFmpeg-Builds\/releases\/download\/autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\//);
    expect(linux.url).toMatch(/linux64-lgpl-shared-\d+\.\d+\.tar\.xz$/);
    expect(linux.url).not.toMatch(/-gpl-/);
    expect(linux.sha256).toMatch(/^[0-9a-f]{64}$/);
    // One release for both, so Windows and Linux run the same ffmpeg.
    expect(linux.url.split('/')[7]).toBe(FFMPEG_ASSETS.windows.url.split('/')[7]);
    expect(FFMPEG_ASSET).toBe(FFMPEG_ASSETS.windows);
  });

  it('on Linux keeps bin/ffmpeg, bin/ffprobe and the versioned libraries they load from ../lib', () => {
    expect(KEEP_FILE_LINUX('ffmpeg-x/bin/ffmpeg')).toBe('bin/ffmpeg');
    expect(KEEP_FILE_LINUX('ffmpeg-x/bin/ffprobe')).toBe('bin/ffprobe');
    expect(KEEP_FILE_LINUX('ffmpeg-x/lib/libavcodec.so.62')).toBe('lib/libavcodec.so.62');
    expect(KEEP_FILE_LINUX('ffmpeg-x/LICENSE.txt')).toBe('LICENSE.txt');
    expect(KEEP_FILE_LINUX('ffmpeg-x/bin/ffplay')).toBeNull();
    expect(KEEP_FILE_LINUX('ffmpeg-x/lib/libavcodec.so')).toBeNull();
    expect(KEEP_FILE_LINUX('ffmpeg-x/lib/libavcodec.so.62.28.103')).toBeNull();
    expect(KEEP_FILE_LINUX('ffmpeg-x/lib/pkgconfig/libavcodec.pc')).toBeNull();
  });

  // CI found the AppImage packer refusing libswresample: the libraries have no search path of their own.
  it('gives each Linux library a search path to its own folder', () => {
    expect(rpathCommands(['bin/ffmpeg', 'lib/libavutil.so.60', 'lib/libswresample.so.6', 'LICENSE.txt'], '/v')).toEqual([
      ['patchelf', ['--set-rpath', '$ORIGIN', '/v/lib/libavutil.so.60']],
      ['patchelf', ['--set-rpath', '$ORIGIN', '/v/lib/libswresample.so.6']],
    ]);
  });

  it('reads the platform from the command line, Windows by default', () => {
    expect(platformArg([])).toBe('windows');
    expect(platformArg(['linux'])).toBe('linux');
    expect(() => platformArg(['darwin'])).toThrow(/windows or linux/);
  });
});
