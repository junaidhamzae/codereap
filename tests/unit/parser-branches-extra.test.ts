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

describe('parser additional branches', () => {
  it('handles require and dynamic import with non-literal args', async () => withTempDir(async (root) => {
    const file = path.join(root, 'n.ts');
    fs.writeFileSync(file, [
      'const mod = require(x);',
      'import(y)',
    ].join('\n'));
    const parsed = await parseFile(file, { collectSymbols: true });
    // No new imports added for non-literal
    expect(parsed.imports).toEqual([]);
    // importSpecs should not include entries for non-literal cases
    expect(parsed.importSpecs).toEqual([]);
  }));

  it('captures export { a } and default identifier case', async () => withTempDir(async (root) => {
    const file = path.join(root, 'e.ts');
    fs.writeFileSync(file, [
      'const a = 1; export { a };',
      'const D = 1; export default D; D;',
    ].join('\n'));
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportsInfo?.named).toEqual(expect.arrayContaining(['a']));
    expect(parsed.exportUsage?.default?.localName).toBe('D');
    expect(parsed.exportUsage?.default?.referencedInFile).toBe(true);
  }));
});


