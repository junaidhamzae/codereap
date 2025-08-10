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

describe('reportGraph without symbols', () => {
  it('emits base fields and in-degree/orphan only', async () => withTempDir(async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    fs.writeFileSync(A, '');
    const g = new Graph();
    g.addNode(A);
    // no symbols map provided
    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, outBase, projectRoot, false, new Set());
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    expect(data[0]).toEqual(expect.objectContaining({ node: 'A.ts', exists: true, orphan: true }));
    expect(data[0].symbols).toBeUndefined();
  }));
});


