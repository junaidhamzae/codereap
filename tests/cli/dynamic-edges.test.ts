import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

function getRow(json: any[], endsWith: string) {
  return (json as any[]).find((r) => r.node.endsWith(endsWith));
}

describe('CLI dynamic edges on/off', () => {
  it('marks C.ts live by default and orphan when dynamicEdges off', () => {
    const fixture = path.resolve(__dirname, '../fixtures/dynamic-literals');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');

    // default: dynamic edges ON
    let res = runCli(['--root', fixture, '--out', outBase]);
    expect(res.status).toBe(0);
    let rows = res.json as any[];
    expect(getRow(rows, 'C.ts').orphan).toBe(false);

    // with dynamicEdges off
    res = runCli(['--root', fixture, '--out', outBase, '--dynamicEdges', 'off']);
    expect(res.status).toBe(0);
    rows = res.json as any[];
    expect(getRow(rows, 'C.ts').orphan).toBe(true);
  });
});


