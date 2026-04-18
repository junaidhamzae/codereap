import fs from 'node:fs';
import path from 'node:path';
import { Graph } from '../../src/grapher';
import { reportGraph } from '../../src/reporter';
import { withTempDir } from '../helpers/withTempDir';

describe('reportGraph without symbols', () => {
  it('emits base fields and in-degree/orphan only', async () => withTempDir('report-', async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    fs.writeFileSync(A, '');
    const g = new Graph();
    g.addNode(A);
    // no symbols map provided
    const outBase = path.join(root, 'out');
    const jsonPath = await reportGraph(g, { outPath: outBase, projectRoot, onlyOrphans: false, liveFiles: new Set() });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any;
    expect(report.files[0]).toEqual(expect.objectContaining({ node: 'A.ts', exists: true, orphan: true }));
    expect(report.files[0].symbols).toBeUndefined();
  }));
});


