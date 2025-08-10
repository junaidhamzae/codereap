import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Graph } from '../../src/grapher';
import { reportDirectories, reportGraph } from '../../src/reporter';

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

describe('reporter branches', () => {
  it('reportDirectories onlyOrphans filter and JSON write path', async () => withTempDir(async (root) => {
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
    const jsonPath = await reportDirectories(g, outBase, projectRoot, true, new Set([A, B]));
    expect(fs.existsSync(jsonPath!)).toBe(true);
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    // only orphan directories; none since both live or have external-in-degree
    expect(data).toEqual([]);
  }));

  it('reportGraph onlyOrphans path produces orphan rows only', async () => withTempDir(async (root) => {
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
    const jsonPath = await reportGraph(g, outBase, projectRoot, true, new Set([A]), symbols);
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    expect(data.length).toBe(1);
    expect(data[0].node).toBe('B.ts');
  }));
});


