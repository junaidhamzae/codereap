import path from 'node:path';
import { Graph } from '../../src/grapher';
import { computeDirectoryRecords } from '../../src/reporter';

describe('reporter directories', () => {
  it('computes directory records and orphan flag', () => {
    const root = '/proj';
    const A = path.join(root, 'a', 'A.ts');
    const B = path.join(root, 'b', 'B.ts');
    const g = new Graph();
    g.addNode(A);
    g.addNode(B);
    g.addEdge(A, B);

    // Only A's directory should be orphan because B has external in-degree
    const records = computeDirectoryRecords(g, root, new Set([A, B]));
    const recA = records.find(r => r.directory === 'a')!;
    const recB = records.find(r => r.directory === 'b')!;
    expect(recA.orphan).toBe(false); // live in dir
    expect(recB.orphan).toBe(false);

    const records2 = computeDirectoryRecords(g, root, new Set([A]));
    const recB2 = records2.find(r => r.directory === 'b')!;
    expect(recB2.orphan).toBe(false); // has external-in-degree
  });
});


