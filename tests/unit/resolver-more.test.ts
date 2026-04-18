import fs from 'node:fs';
import path from 'node:path';
import { resolveImport } from '../../src/resolver';
import { withTempDir } from '../helpers/withTempDir';

describe('resolver fallbacks and errors', () => {
  it('falls back to project root and then node resolution with error', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    const target = path.join(root, 'pkgfile.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(target, '');

    // Absolute-like specifier resolved under project root
    const p = resolveImport(from, 'pkgfile', { root });
    expect(p).toBe(target);

    // Unresolvable bare package should be suppressed (no console error) and return null
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const none = resolveImport(from, 'definitely-not-a-real-pkg-name-xyz', { root });
    expect(none).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }));
});


