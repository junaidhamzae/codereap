import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadCodereapConfig, loadTsJsConfig } from '../../src/config';

function withTempDir(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
  try { run(dir); } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

describe('config invalid scenarios', () => {
  it('handles invalid JSON in codereap.config.json', () => withTempDir((root) => {
    fs.writeFileSync(path.join(root, 'codereap.config.json'), '{invalid json');
    const cfg = loadCodereapConfig(root);
    expect(cfg.root).toBe(root);
  }));

  it('handles missing ts/jsconfig', () => withTempDir((root) => {
    const cfg = loadTsJsConfig(root);
    expect(cfg).toEqual({});
  }));
});


