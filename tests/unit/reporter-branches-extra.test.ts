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

describe('reporter additional branches', () => {
  it('handles symbols present but no importSpecs', async () => withTempDir(async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    fs.writeFileSync(A, '');
    const g = new Graph();
    g.addNode(A);
    const symbols = new Map<string, any>([[A, { exports: { hasDefault: false, named: [], reExports: [] }, importSpecs: [], exportUsage: { named: {} } }]]);
    const jsonPath = await reportGraph(g, path.join(root, 'out'), projectRoot, false, new Set(), symbols);
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    expect(data[0].symbols.exports.default.exists).toBe(false);
  }));
});


