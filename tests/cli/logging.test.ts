import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runCli } from '../helpers/cli';

describe('CLI logging', () => {
  it('prints root-relative entrypoints list', () => {
    const fixture = path.resolve(__dirname, '../fixtures/basic-static');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const outBase = path.join(tmp, 'report');
    const res = runCli(['--root', fixture, '--out', outBase]);
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/Project Source Entrypoints \(relative\):/);
  });
});


