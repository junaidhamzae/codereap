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

describe('reporter shape', () => {
  it('emits exports for all rows; imports only for orphan rows; enrich target with onlyOrphans', async () => withTempDir(async (root) => {
    const projectRoot = root; // absolute
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
      exports: { hasDefault: false, named: [], reExports: [] },
      importSpecs: [ { source: './B', kind: 'esm', imported: { default: false, named: [], namespace: false }, resolved: B } ],
      exportUsage: { named: {} },
    });
    symbols.set(B, {
      exports: { hasDefault: true, named: ['x'], reExports: [] },
      importSpecs: [],
      exportUsage: { default: { exists: true, localName: 'X', referencedInFile: false }, named: { x: { referencedInFile: false } } },
    });

    const live = new Set([A, B]);
    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, outBase, projectRoot, true, live, symbols);
    expect(jsonPath).toBe(outBase + '.json');
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    // onlyOrphans: none should be emitted since live contains both
    expect(data).toEqual([]);

    // Now mark B as orphan and re-run
    const live2 = new Set([A]);
    const jsonPath2 = await reportGraph(g, outBase, projectRoot, true, live2, symbols);
    const data2 = JSON.parse(fs.readFileSync(jsonPath2!, 'utf8')) as any[];
    expect(data2.length).toBe(1);
    const row = data2[0];
    expect(row.node).toBe(path.relative(projectRoot, B));
    expect(row.symbols?.exports).toBeDefined();
    // Orphan row with no imports should include an empty imports array
    expect(row.symbols?.imports).toEqual([]);

    // Make A orphan so its imports appear and are enriched
    const live3 = new Set<string>();
    const jsonPath3 = await reportGraph(g, outBase, projectRoot, true, live3, symbols);
    const data3 = JSON.parse(fs.readFileSync(jsonPath3!, 'utf8')) as any[];
    const aRow = data3.find(r => r.node === path.relative(projectRoot, A));
    expect(aRow.symbols.imports[0]).toEqual(expect.objectContaining({ source: './B', resolved: path.relative(projectRoot, B) }));
    expect(aRow.symbols.imports[0].target).toEqual(expect.objectContaining({ node: path.relative(projectRoot, B) }));
  }));
});


