import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';
import { normalizeReport } from '../helpers/normalize';

describe('CLI basic-static fixture', () => {
  it('finds D.ts as orphan and outputs required keys', () => {
    const fixture = path.resolve(__dirname, '../fixtures/basic-static');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const { stdout, status, json } = runCli([
      '--root', fixture,
      '--out', outBase,
    ]);
    expect(status).toBe(0);
    expect(Array.isArray(json)).toBe(true);
    const rows = normalizeReport(json as any[]);
    const dRow = rows.find(r => r.node.endsWith('D.ts'))!;
    expect(dRow.orphan).toBe(true);
    expect(rows).toMatchSnapshot();
    // sanity keys
    expect(dRow).toEqual(expect.objectContaining({ node: expect.any(String), exists: true, orphan: expect.any(Boolean) }));
  });
});


