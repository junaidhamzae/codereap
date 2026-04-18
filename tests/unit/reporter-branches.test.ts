import fs from 'node:fs';
import path from 'node:path';
import { Graph } from '../../src/grapher';
import { reportDirectories, reportGraph } from '../../src/reporter';
import { withTempDir } from '../helpers/withTempDir';

describe('reporter branches', () => {
  it('reportDirectories onlyOrphans filter and JSON write path', async () => withTempDir('report-', async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'a', 'A.ts');
    const B = path.join(root, 'b', 'B.ts');
    fs.mkdirSync(path.dirname(A), { recursive: true });
    fs.mkdirSync(path.dirname(B), { recursive: true });
    fs.writeFileSync(A, '');
    fs.writeFileSync(B, '');

    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    g.addEdge(A, B);

    const outBase = path.join(root, 'out');
    const jsonPath = await reportDirectories(g, { outPath: outBase, projectRoot, onlyOrphans: true, liveFiles: new Set([A, B]) });
    expect(fs.existsSync(jsonPath!)).toBe(true);
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any;
    // only orphan directories; none since both live or have external-in-degree
    expect(report.directories).toEqual([]);
  }));

  it('reportGraph onlyOrphans path produces orphan rows only', async () => withTempDir('report-', async (root) => {
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
    symbols.set(A, { exports: { hasDefault: false, named: [], reExports: [] }, importSpecs: [], exportUsage: { named: {} } });
    symbols.set(B, { exports: { hasDefault: false, named: [], reExports: [] }, importSpecs: [], exportUsage: { named: {} } });

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, { outPath: outBase, projectRoot, onlyOrphans: true, liveFiles: new Set([A]), symbols });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any;
    expect(report.files.length).toBe(1);
    expect(report.files[0].node).toBe('B.ts');
  }));
});


