import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveImport } from '../../src/resolver';

function withTempDir(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-'));
  try { run(dir); } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

describe('resolver exact extension', () => {
  it('returns candidatePath when specifier includes extension', () => withTempDir((root) => {
    const from = path.join(root, 'src', 'a.ts');
    const target = path.join(root, 'src', 'b.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(target, '');
    const p = resolveImport(from, './b.ts', { root });
    expect(p).toBe(target);
  }));
});


