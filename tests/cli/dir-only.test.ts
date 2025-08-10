import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

describe('CLI --dirOnly directory aggregation', () => {
  it('aggregates directories and applies orphan rule', () => {
    const fixture = path.resolve(__dirname, '../fixtures/dir-only');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const res = runCli(['--root', fixture, '--out', outBase, '--dirOnly', '--onlyOrphans']);
    expect(res.status).toBe(0);
    const rows = res.json as any[];
    // Only orphan directories should be listed
    const dirs = rows.map(r => r.directory).sort();
    // b has an incoming edge from a, so it is not orphan; a has outgoing only, so it is orphan when onlyOrphans
    expect(dirs).toEqual(['a']);
    expect(rows).toMatchSnapshot();
  });
});


