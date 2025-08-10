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

describe('parser misc', () => {
  it('returns empty for non-script files with symbols', async () => withTempDir(async (root) => {
    const file = path.join(root, 'data.json');
    fs.writeFileSync(file, '{"a":1}');
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.imports).toEqual([]);
    expect(parsed.dynamicImports).toEqual([]);
    expect(parsed.importSpecs).toEqual([]);
    expect(parsed.exportsInfo).toEqual({ hasDefault: false, named: [], reExports: [] });
  }));

  it('captures default local name for class/function export', async () => withTempDir(async (root) => {
    const file = path.join(root, 'd.ts');
    fs.writeFileSync(file, 'export default class D {}; D;');
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportUsage?.default?.exists).toBe(true);
    expect(parsed.exportUsage?.default?.localName).toBe('D');
    expect(parsed.exportUsage?.default?.referencedInFile).toBe(true);
  }));
});


