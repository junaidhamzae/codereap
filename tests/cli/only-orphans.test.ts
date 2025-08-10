import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

describe('CLI --onlyOrphans with target enrichment', () => {
  it('includes symbols.imports with target info for resolvable imports', () => {
    const fixture = path.resolve(__dirname, '../fixtures/only-orphans');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const res = runCli(['--root', fixture, '--out', outBase, '--onlyOrphans']);
    expect(res.status).toBe(0);
    const data = res.json as any[];
    const a = data.find(r => r.node.endsWith('A.ts'))!;
    expect(a.symbols.imports[0]).toEqual(expect.objectContaining({ source: './B', target: expect.any(Object) }));
    expect(data).toMatchSnapshot();
  });
});


