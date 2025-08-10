import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

function getRow(json: any[], endsWith: string) {
  return (json as any[]).find((r) => r.node.endsWith(endsWith));
}

describe('CLI alias/importRoot resolution', () => {
  it('resolves modules via tsconfig paths and importRoot', () => {
    const fixture = path.resolve(__dirname, '../fixtures/alias-importRoot');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const res = runCli(['--root', fixture, '--out', outBase, '--importRoot', './src']);
    expect(res.status).toBe(0);
    const rows = res.json as any[];
    // util and button should be live due to index.ts imports
    expect(getRow(rows, 'src/util.ts').orphan).toBe(false);
    expect(getRow(rows, 'src/components/Button/index.ts').orphan).toBe(false);
  });
});


