import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanFiles } from '../../src/scanner';
import { Graph } from '../../src/grapher';

function withTempDir(run: (dir: string) => Promise<void> | void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const res = run(dir);
  if (res && typeof (res as any).then === 'function') {
    return (res as Promise<void>).finally(() => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('scanner and grapher basics', () => {
  it('scans extensions and ignores excluded', async () => withTempDir(async (root) => {
    const a = path.join(root, 'src', 'a.ts');
    const b = path.join(root, 'src', 'b.js');
    const c = path.join(root, 'src', '__tests__', 'c.ts');
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.mkdirSync(path.dirname(c), { recursive: true });
    fs.writeFileSync(a, '');
    fs.writeFileSync(b, '');
    fs.writeFileSync(c, '');
    const files = await scanFiles(root, ['ts','js'], ['**/__tests__/**'], path.join(root, 'src'));
    expect(new Set(files)).toEqual(new Set([a,b]));
  }));

  it('uses project root when rootDir is falsy', async () => withTempDir(async (root) => {
    const a = path.join(root, 'x', 'a.ts');
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, '');
    const files = await scanFiles(root, ['ts','js'], [], root);
    expect(files).toEqual([a]);
  }));

  it('Graph addNode/addEdge/toJSON', () => {
    const g = new Graph();
    g.addNode('/a');
    g.addNode('/b');
    g.addEdge('/a','/b');
    expect(g.toJSON()).toEqual({ nodes: ['/a','/b'], edges: [['/a','/b']] });
  });
});


