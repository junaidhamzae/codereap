import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Graph } from '../../src/grapher';
import { reportGraph } from '../../src/reporter';

function withTempDir(run: (dir: string) => Promise<void> | void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  const res = run(dir);
  if (res && typeof (res as any).then === 'function') {
    return (res as Promise<void>).finally(() => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('reporter orphan imports sorting', () => {
  it('includes and sorts imports for orphan rows', async () => withTempDir(async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    const B = path.join(root, 'B.ts');
    fs.writeFileSync(A, '');
    fs.writeFileSync(B, '');

    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    // No edges so both orphan

    const symbols = new Map<string, any>();
    symbols.set(A, {
      exports: { hasDefault: false, named: [], reExports: [] },
      importSpecs: [
        { source: './z', kind: 'esm', imported: { default: false, named: [], namespace: false }, resolved: undefined },
        { source: './B', kind: 'esm', imported: { default: false, named: [], namespace: false }, resolved: B },
      ],
      exportUsage: { named: {} },
    });
    symbols.set(B, {
      exports: { hasDefault: false, named: [], reExports: [] },
      importSpecs: [],
      exportUsage: { named: {} },
    });

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, outBase, projectRoot, false, new Set(), symbols);
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    const aRow = data.find(r => r.node === 'A.ts');
    expect(aRow.symbols.imports.map((i: any) => i.source)).toEqual(['./B', './z']);
  }));
});


