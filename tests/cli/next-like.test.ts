import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

function getRow(json: any[], endsWith: string) {
  return (json as any[]).find((r) => r.node.endsWith(endsWith));
}

describe('CLI Next-like auto seeding', () => {
  it('prints Next detection and seeds entrypoints', () => {
    const fixture = path.resolve(__dirname, '../fixtures/next-like');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const res = runCli(['--root', fixture, '--out', outBase]);
    expect(res.status).toBe(0);
    // page should be live, and component reachable
    const rows = res.json as any[];
    expect(getRow(rows, 'pages/index.ts').orphan).toBe(false);
    expect(getRow(rows, 'components/Widget.ts').orphan).toBe(false);
    // stdout should include Next detection message
    expect(res.stdout).toMatch(/Next\.js detected/);
    expect(rows).toMatchSnapshot();
  });
});


