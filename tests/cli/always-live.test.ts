import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

describe('CLI --alwaysLive globs', () => {
  it('marks files live without edges', () => {
    const fixture = path.resolve(__dirname, '../fixtures/always-live');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const res = runCli(['--root', fixture, '--out', outBase, '--alwaysLive', '**/E.*']);
    expect(res.status).toBe(0);
    const rows = res.json as any[];
    const e = rows.find(r => r.node.endsWith('E.ts'))!;
    expect(e.orphan).toBe(false);
    expect(rows).toMatchSnapshot();
  });
});


