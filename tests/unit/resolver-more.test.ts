import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveImport } from '../../src/resolver';

function withTempDir(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-'));
  try { run(dir); } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

describe('resolver fallbacks and errors', () => {
  it('falls back to project root and then node resolution with error', () => withTempDir((root) => {
    const from = path.join(root, 'src', 'a.ts');
    const target = path.join(root, 'pkgfile.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(target, '');

    // Absolute-like specifier resolved under project root
    const p = resolveImport(from, 'pkgfile', { root });
    expect(p).toBe(target);

    // Unresolvable package should hit node resolution catch path
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const none = resolveImport(from, 'definitely-not-a-real-pkg-name-xyz', { root });
    expect(none).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  }));
});


