import fs from 'node:fs';
import path from 'node:path';
import { Graph } from '../../src/grapher';
import { reportGraph, reportDirectories } from '../../src/reporter';
import { withTempDir } from '../helpers/withTempDir';

describe('report metadata wrapper', () => {
  it('includes version, timestamp, root, entrypoints, and counts', async () => withTempDir('report-', async (root) => {
    const A = path.join(root, 'A.ts');
    const B = path.join(root, 'B.ts');
    fs.writeFileSync(A, '');
    fs.writeFileSync(B, '');

    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    g.addEdge(A, B, 'static-import');

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, {
      outPath: outBase, projectRoot: root, onlyOrphans: false, liveFiles: new Set([A, B]),
      entrypointSet: new Set([A]), packageVersion: '0.13.0',
    });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8'));

    expect(report.version).toBe('0.13.0');
    expect(report.timestamp).toBeDefined();
    expect(report.root).toBe(root);
    expect(report.entrypoints).toEqual(['A.ts']);
    expect(report['total-files']).toBe(2);
    expect(report['orphan-count']).toBe(0);
    expect(report['live-count']).toBe(2);
    expect(Array.isArray(report.files)).toBe(true);
  }));

  it('includes imported-by with edge types', async () => withTempDir('report-', async (root) => {
    const A = path.join(root, 'A.ts');
    const B = path.join(root, 'B.ts');
    fs.writeFileSync(A, '');
    fs.writeFileSync(B, '');

    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    g.addEdge(A, B, 'dynamic-import');

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, {
      outPath: outBase, projectRoot: root, onlyOrphans: false, liveFiles: new Set([A, B]),
      entrypointSet: new Set([A]), packageVersion: '0.13.0',
    });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8'));
    const bRow = report.files.find((r: any) => r.node === 'B.ts');

    expect(bRow['imported-by']).toEqual([
      { file: 'A.ts', type: 'dynamic-import' },
    ]);
  }));

  it('includes entrypoints that reach each file', async () => withTempDir('report-', async (root) => {
    const A = path.join(root, 'A.ts');
    const B = path.join(root, 'B.ts');
    const C = path.join(root, 'C.ts');
    fs.writeFileSync(A, '');
    fs.writeFileSync(B, '');
    fs.writeFileSync(C, '');

    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    g.addNode(C);
    g.addEdge(A, B, 'static-import');
    // C is orphan

    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, {
      outPath: outBase, projectRoot: root, onlyOrphans: false, liveFiles: new Set([A, B]),
      entrypointSet: new Set([A]), packageVersion: '0.13.0',
    });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8'));

    const aRow = report.files.find((r: any) => r.node === 'A.ts');
    const bRow = report.files.find((r: any) => r.node === 'B.ts');
    const cRow = report.files.find((r: any) => r.node === 'C.ts');

    expect(aRow.entrypoints).toEqual(['A.ts']);
    expect(bRow.entrypoints).toEqual(['A.ts']);
    expect(cRow.entrypoints).toEqual([]);
    expect(cRow.orphan).toBe(true);
  }));

  it('directory report includes metadata wrapper', async () => withTempDir('report-', async (root) => {
    const A = path.join(root, 'a', 'A.ts');
    fs.mkdirSync(path.dirname(A), { recursive: true });
    fs.writeFileSync(A, '');

    const g = new Graph();
    g.addNode(A);

    const outBase = path.join(root, 'out');
    const jsonPath = await reportDirectories(g, { outPath: outBase, projectRoot: root, onlyOrphans: false, liveFiles: new Set(), packageVersion: '0.13.0' });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8'));

    expect(report.version).toBe('0.13.0');
    expect(report.timestamp).toBeDefined();
    expect(report['total-directories']).toBeDefined();
    expect(Array.isArray(report.directories)).toBe(true);
  }));
});
