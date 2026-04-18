import fs from 'node:fs';
import path from 'node:path';
import { Graph } from '../../src/grapher';
import { reportGraph } from '../../src/reporter';
import { withTempDir } from '../helpers/withTempDir';

describe('reporter shape', () => {
  it('emits exports for all rows; imports only for orphan rows; enrich target with onlyOrphans', async () => withTempDir('report-', async (root) => {
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
    const jsonPath = await reportGraph(g, { outPath: outBase, projectRoot, onlyOrphans: true, liveFiles: live, symbols });
    expect(jsonPath).toBe(outBase + '.json');
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any;
    // onlyOrphans: none should be emitted since live contains both
    expect(report.files).toEqual([]);

    // Now mark B as orphan and re-run
    const live2 = new Set([A]);
    const jsonPath2 = await reportGraph(g, { outPath: outBase, projectRoot, onlyOrphans: true, liveFiles: live2, symbols });
    const report2 = JSON.parse(fs.readFileSync(jsonPath2!, 'utf8')) as any;
    expect(report2.files.length).toBe(1);
    const row = report2.files[0];
    expect(row.node).toBe(path.relative(projectRoot, B));
    expect(row.symbols?.exports).toBeDefined();
    // Orphan row with no imports should include an empty imports array
    expect(row.symbols?.imports).toEqual([]);

    // Make A orphan so its imports appear and are enriched
    const live3 = new Set<string>();
    const jsonPath3 = await reportGraph(g, { outPath: outBase, projectRoot, onlyOrphans: true, liveFiles: live3, symbols });
    const report3 = JSON.parse(fs.readFileSync(jsonPath3!, 'utf8')) as any;
    const aRow = report3.files.find((r: any) => r.node === path.relative(projectRoot, A));
    expect(aRow.symbols.imports[0]).toEqual(expect.objectContaining({ source: './B', resolved: path.relative(projectRoot, B) }));
    expect(aRow.symbols.imports[0].target).toEqual(expect.objectContaining({ node: path.relative(projectRoot, B) }));
  }));
});


