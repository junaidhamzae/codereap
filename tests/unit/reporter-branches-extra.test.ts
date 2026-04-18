import fs from 'node:fs';
import path from 'node:path';
import { Graph } from '../../src/grapher';
import { reportGraph } from '../../src/reporter';
import { withTempDir } from '../helpers/withTempDir';

describe('reporter additional branches', () => {
  it('handles symbols present but no importSpecs', async () => withTempDir('report-', async (root) => {
    const projectRoot = root;
    const A = path.join(root, 'A.ts');
    fs.writeFileSync(A, '');
    const g = new Graph();
    g.addNode(A);
    const symbols = new Map<string, any>([[A, { exports: { hasDefault: false, named: [], reExports: [] }, importSpecs: [], exportUsage: { named: {} } }]]);
    const jsonPath = await reportGraph(g, { outPath: path.join(root, 'out'), projectRoot, onlyOrphans: false, liveFiles: new Set(), symbols });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any;
    expect(report.files[0].symbols.exports.default.exists).toBe(false);
  }));
});


