import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFile } from '../../src/parser';

function withTempDir(run: (dir: string) => Promise<void> | void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-'));
  const res = run(dir);
  if (res && typeof (res as any).then === 'function') {
    return (res as Promise<void>).finally(() => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('parser exports', () => {
  it('captures default and named exports and re-exports', async () => withTempDir(async (root) => {
    const file = path.join(root, 'm.ts');
    fs.writeFileSync(
      file,
      [
        'export default function D() { return 1 }',
        'export const a = 1;',
        'export { a as aa }',
        "export { x as xx } from './other'",
        "export * from './star'",
      ].join('\n'),
    );
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportsInfo).toBeDefined();
    expect(parsed.exportsInfo!.hasDefault).toBe(true);
    expect(new Set(parsed.exportsInfo!.named)).toEqual(new Set(['a','aa','xx']));
    expect(parsed.exportsInfo!.reExports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: './other', named: expect.arrayContaining(['xx']) }),
        expect.objectContaining({ source: './star', star: true }),
      ])
    );
  }));

  it('computes exportUsage.referencedInFile for default and named', async () => withTempDir(async (root) => {
    const file = path.join(root, 'u.ts');
    fs.writeFileSync(
      file,
      [
        'export default function D() { return 1 }',
        'export function used() { return 2 }',
        'export function unused() { return 3 }',
        'D();',
        'used();',
      ].join('\n'),
    );
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportUsage?.default?.exists).toBe(true);
    expect(parsed.exportUsage?.default?.referencedInFile).toBe(true);
    expect(parsed.exportUsage?.named['used']?.referencedInFile).toBe(true);
    expect(parsed.exportUsage?.named['unused']?.referencedInFile).toBe(false);
  }));
});


