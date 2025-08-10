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

describe('reporter export orphan calculation branches', () => {
  it('marks default and named export orphan when neither referenced nor consumed', async () => withTempDir(async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    fs.writeFileSync(A, '');
    const g = new Graph();
    g.addNode(A);

    const symbols = new Map<string, any>([[A, {
      exports: { hasDefault: true, named: ['x'], reExports: [] },
      importSpecs: [],
      exportUsage: { default: { exists: true, localName: 'A', referencedInFile: false }, named: { x: { referencedInFile: false } } },
    }]]);

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, outBase, projectRoot, false, new Set(), symbols, new Map());
    const data = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any[];
    const row = data.find(r => r.node === 'A.ts');
    expect(row.symbols.exports.default.orphan).toBe(true);
    const namedX = row.symbols.exports.named.find((n: any) => n.name === 'x');
    expect(namedX.orphan).toBe(true);
  }));
});


