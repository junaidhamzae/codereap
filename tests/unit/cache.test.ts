import fs from 'node:fs';
import path from 'node:path';
import {
  writeCache,
  readCache,
  purgeCache,
  getCachePath,
  CacheNotFoundError,
  CacheVersionMismatchError,
  CacheRootMismatchError,
  CacheData,
} from '../../src/cache';
import { withTempDir } from '../helpers/withTempDir';

/** Build a sample cache with root set to the given directory */
function makeSampleCache(root: string): CacheData {
  return {
    version: '0.13.0',
    timestamp: '2026-04-13T00:00:00.000Z',
    root,
    entrypoints: [`${root}/src/index.ts`],
    files: [`${root}/src/index.ts`, `${root}/src/utils.ts`, `${root}/src/dead.ts`],
    edges: [
      { from: `${root}/src/index.ts`, to: `${root}/src/utils.ts`, type: 'static-import' },
    ],
    reachable: [`${root}/src/index.ts`, `${root}/src/utils.ts`],
    orphans: [`${root}/src/dead.ts`],
  };
}

describe('cache module', () => {
  it('getCachePath returns correct path', () => {
    expect(getCachePath('/my/project')).toBe('/my/project/.codereap-cache.json');
  });

  it('writeCache writes valid JSON', async () => withTempDir('cache-', async (dir) => {
    const sample = makeSampleCache(dir);
    const cachePath = await writeCache(dir, sample);
    expect(fs.existsSync(cachePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    expect(parsed.version).toBe('0.13.0');
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.files).toHaveLength(3);
  }));

  it('readCache reads and returns data', async () => withTempDir('cache-', async (dir) => {
    const sample = makeSampleCache(dir);
    await writeCache(dir, sample);
    const data = await readCache(dir, '0.13.0');
    expect(data.version).toBe('0.13.0');
    expect(data.entrypoints).toEqual([`${dir}/src/index.ts`]);
    expect(data.orphans).toEqual([`${dir}/src/dead.ts`]);
  }));

  it('readCache throws CacheNotFoundError when no cache exists', async () => withTempDir('cache-', async (dir) => {
    await expect(readCache(dir, '0.13.0')).rejects.toThrow(CacheNotFoundError);
  }));

  it('readCache throws CacheVersionMismatchError on version mismatch', async () => withTempDir('cache-', async (dir) => {
    const sample = makeSampleCache(dir);
    await writeCache(dir, sample);
    await expect(readCache(dir, '0.14.0')).rejects.toThrow(CacheVersionMismatchError);
    try {
      await readCache(dir, '0.14.0');
    } catch (err: any) {
      expect(err.message).toContain('v0.13.0');
      expect(err.message).toContain('v0.14.0');
    }
  }));

  it('readCache throws CacheRootMismatchError when root differs', async () => withTempDir('cache-', async (dir) => {
    // Write cache with a different root than the dir we'll read from
    const sample = makeSampleCache('/some/other/project');
    await writeCache(dir, sample);
    await expect(readCache(dir, '0.13.0')).rejects.toThrow(CacheRootMismatchError);
    try {
      await readCache(dir, '0.13.0');
    } catch (err: any) {
      expect(err.message).toContain('/some/other/project');
      expect(err.message).toContain(dir);
    }
  }));

  it('purgeCache deletes the cache file', async () => withTempDir('cache-', async (dir) => {
    const sample = makeSampleCache(dir);
    await writeCache(dir, sample);
    expect(fs.existsSync(getCachePath(dir))).toBe(true);
    const deleted = await purgeCache(dir);
    expect(deleted).toBe(true);
    expect(fs.existsSync(getCachePath(dir))).toBe(false);
  }));

  it('purgeCache returns false when no cache exists', async () => withTempDir('cache-', async (dir) => {
    const deleted = await purgeCache(dir);
    expect(deleted).toBe(false);
  }));
});
