import fs from 'node:fs';
import { withTempDir } from '../helpers/withTempDir';

describe('withTempDir helper', () => {
  it('cleans up after a successful sync callback', () => {
    let capturedDir = '';
    withTempDir('withtempdir-sync-ok-', (dir) => {
      capturedDir = dir;
      expect(fs.existsSync(dir)).toBe(true);
    });
    expect(capturedDir).not.toBe('');
    expect(fs.existsSync(capturedDir)).toBe(false);
  });

  it('cleans up after a successful async callback', async () => {
    let capturedDir = '';
    await withTempDir('withtempdir-async-ok-', async (dir) => {
      capturedDir = dir;
      expect(fs.existsSync(dir)).toBe(true);
    });
    expect(capturedDir).not.toBe('');
    expect(fs.existsSync(capturedDir)).toBe(false);
  });

  it('cleans up when the sync callback throws (no tempdir leak)', () => {
    let capturedDir = '';
    expect(() => {
      withTempDir('withtempdir-sync-throw-', (dir) => {
        capturedDir = dir;
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(capturedDir).not.toBe('');
    expect(fs.existsSync(capturedDir)).toBe(false);
  });

  it('cleans up when the async callback rejects (no tempdir leak)', async () => {
    let capturedDir = '';
    await expect(
      withTempDir('withtempdir-async-throw-', async (dir) => {
        capturedDir = dir;
        throw new Error('async boom');
      })
    ).rejects.toThrow('async boom');
    expect(capturedDir).not.toBe('');
    expect(fs.existsSync(capturedDir)).toBe(false);
  });

  it('does not delete tempdir prematurely on async path (handoff works)', async () => {
    // If the outer finally deleted the dir synchronously before the promise
    // resolved, this file write inside the async callback would fail.
    await withTempDir('withtempdir-async-handoff-', async (dir) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(fs.existsSync(dir)).toBe(true);
      fs.writeFileSync(`${dir}/probe.txt`, 'hi');
      expect(fs.readFileSync(`${dir}/probe.txt`, 'utf8')).toBe('hi');
    });
  });
});
