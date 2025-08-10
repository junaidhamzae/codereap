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

describe('reportGraph JSON full path', () => {
  it('writes JSON including exports for all and sorted imports for orphan', async () => withTempDir(async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    const B = path.join(root, 'B.ts');
    fs.writeFileSync(A, '');
    fs.writeFileSync(B, '');

    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    g.addEdge(A, B);

    const symbols = new Map<string, any>();
    symbols.set(A, {
      exports: { hasDefault: false, named: [], reExports: [{ source: './B', named: ['x'] }] },
      importSpecs: [
        { source: './B', kind: 'esm', imported: { default: false, named: ['x'], namespace: false }, resolved: B },
        { source: './unresolved', kind: 'esm', imported: { default: false, named: [], namespace: false }, resolved: undefined },
      ],
      exportUsage: { named: {} },
    });
    symbols.set(B, {
      exports: { hasDefault: true, named: ['x'], reExports: [] },
      importSpecs: [],
      exportUsage: { default: { exists: true, localName: 'X', referencedInFile: false }, named: { x: { referencedInFile: false } } },
    });

    const consumptionIndex = new Map<string, any>([[B, { defaultConsumed: true, namespaceConsumed: false, namedConsumed: new Set(['x']) }]]);
    const usageMap = new Map<string, any>([[A, { named: {} }]]);

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, outBase, projectRoot, false, new Set([A, B]), symbols, consumptionIndex, usageMap);
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    // both rows should be present
    expect(Array.isArray(data) && data.length === 2).toBe(true);
    const aRow = data.find(r => r.node === 'A.ts');
    const bRow = data.find(r => r.node === 'B.ts');
    expect(aRow.symbols.exports).toBeDefined();
    expect(bRow.symbols.exports).toBeDefined();
    // A is live here; no imports array
    expect(aRow.symbols.imports).toBeUndefined();
  }));
});


