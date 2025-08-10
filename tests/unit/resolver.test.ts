import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveImport, type ResolveOptions } from '../../src/resolver';

function withTempDir(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-'));
  try {
    run(dir);
  } finally {
    // best-effort cleanup
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

describe('resolver.resolveImport', () => {
  it('resolves relative files and extension fallback', () => withTempDir((root) => {
    const from = path.join(root, 'src', 'a.ts');
    const target = path.join(root, 'src', 'b.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(target, '');

    const opts: ResolveOptions = { root };
    // relative
    const rel = resolveImport(from, './b', opts);
    expect(rel).toBe(target);
  }));

  it('resolves directory index', () => withTempDir((root) => {
    const from = path.join(root, 'src', 'a.ts');
    const dir = path.join(root, 'src', 'lib');
    const index = path.join(dir, 'index.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(index, '');

    const resolved = resolveImport(from, './lib', { root });
    expect(resolved).toBe(index);
  }));

  it('uses importRoot for absolute-like specifiers', () => withTempDir((root) => {
    const from = path.join(root, 'src', 'a.ts');
    const under = path.join(root, 'src', 'utils', 'x.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.mkdirSync(path.dirname(under), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(under, '');

    const resolved = resolveImport(from, 'utils/x', { root, importRoot: path.join(root, 'src') });
    expect(resolved).toBe(under);
  }));

  it('resolves via ts/jsconfig-style paths with wildcards and multi-star', () => withTempDir((root) => {
    const from = path.join(root, 'src', 'a.ts');
    const comp = path.join(root, 'src', 'components', 'Button', 'index.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.mkdirSync(path.dirname(comp), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(comp, '');

    const opts: ResolveOptions = {
      root,
      paths: {
        'components/*': ['src/components/*'],
        '@ui/*/index': ['src/components/*/index'],
      },
    };

    const p1 = resolveImport(from, 'components/Button', opts);
    expect(p1).toBe(comp);

    const p2 = resolveImport(from, '@ui/Button/index', opts);
    expect(p2).toBe(comp);
  }));
});


