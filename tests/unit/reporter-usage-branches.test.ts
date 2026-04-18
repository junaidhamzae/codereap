import fs from 'node:fs';
import path from 'node:path';
import { Graph } from '../../src/grapher';
import { reportGraph } from '../../src/reporter';
import { withTempDir } from '../helpers/withTempDir';

describe('reporter export orphan calculation branches', () => {
  it('marks default and named export orphan when neither referenced nor consumed', async () => withTempDir('report-', async (root) => {
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
    const jsonPath = await reportGraph(g, { outPath: outBase, projectRoot, onlyOrphans: false, liveFiles: new Set(), symbols, consumptionIndex: new Map() });
    const report = JSON.parse(fs.readFileSync(jsonPath!, 'utf8')) as any;
    const row = report.files.find((r: any) => r.node === 'A.ts');
    expect(row.symbols.exports.default.orphan).toBe(true);
    const namedX = row.symbols.exports.named.find((n: any) => n.name === 'x');
    expect(namedX.orphan).toBe(true);
  }));
});


