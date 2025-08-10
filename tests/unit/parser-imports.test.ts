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

describe('parser imports', () => {
  it('captures ESM default, named, and namespace imports', async () => withTempDir(async (root) => {
    const file = path.join(root, 'a.ts');
    fs.writeFileSync(
      file,
      [
        "import d, { a as A, b } from './m';",
        "import * as NS from './n';",
      ].join('\n'),
    );
    const parsed = await parseFile(file, { collectSymbols: true });
    const specs = parsed.importSpecs!;
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: './m',
          kind: 'esm',
          imported: expect.objectContaining({ default: true, named: expect.arrayContaining(['a','b']), namespace: false }),
        }),
        expect.objectContaining({
          source: './n',
          kind: 'esm',
          imported: expect.objectContaining({ default: false, named: [], namespace: true }),
        }),
      ])
    );
  }));

  it('captures CJS require default and destructured named', async () => withTempDir(async (root) => {
    const file = path.join(root, 'b.ts');
    fs.writeFileSync(
      file,
      [
        "const x = require('./x');",
        "const { A, B } = require('./y');",
        "require('./z')",
      ].join('\n'),
    );
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.importSpecs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: './x', kind: 'cjs', imported: { default: true, named: [], namespace: false } }),
        expect.objectContaining({ source: './y', kind: 'cjs', imported: { default: false, named: ['A','B'], namespace: false } }),
        expect.objectContaining({ source: './z', kind: 'cjs' }),
      ])
    );
    // imports should include sources
    expect(parsed.imports).toEqual(expect.arrayContaining(['./x','./y','./z']));
  }));

  it('captures dynamic import literals', async () => withTempDir(async (root) => {
    const file = path.join(root, 'c.ts');
    fs.writeFileSync(file, "import('./dyn')");
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.importSpecs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: './dyn', kind: 'dynamic' })
      ])
    );
    expect(parsed.dynamicImports).toEqual(['./dyn']);
  }));
});


