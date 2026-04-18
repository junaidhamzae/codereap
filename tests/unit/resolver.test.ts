import fs from 'node:fs';
import path from 'node:path';
import { resolveImport, type ResolveOptions } from '../../src/resolver';
import { withTempDir } from '../helpers/withTempDir';

describe('resolver.resolveImport', () => {
  it('resolves relative files and extension fallback', () => withTempDir('resolver-', (root) => {
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

  it('resolves directory index', () => withTempDir('resolver-', (root) => {
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

  it('uses importRoot for absolute-like specifiers', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    const under = path.join(root, 'src', 'utils', 'x.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.mkdirSync(path.dirname(under), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(under, '');

    const resolved = resolveImport(from, 'utils/x', { root, importRoot: path.join(root, 'src') });
    expect(resolved).toBe(under);
  }));

  it('resolves via ts/jsconfig-style paths with wildcards and multi-star', () => withTempDir('resolver-', (root) => {
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

  it('resolves .d.ts extension', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    const target = path.join(root, 'src', 'types.d.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(target, '');

    const resolved = resolveImport(from, './types', { root });
    expect(resolved).toBe(target);
  }));

  it('prefers .ts over .d.ts when both exist', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    const tsFile = path.join(root, 'src', 'foo.ts');
    const dtsFile = path.join(root, 'src', 'foo.d.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(tsFile, '');
    fs.writeFileSync(dtsFile, '');

    const resolved = resolveImport(from, './foo', { root });
    expect(resolved).toBe(tsFile);
  }));

  it('resolves SCSS partials (_filename.scss)', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'main.scss');
    const partial = path.join(root, 'src', '_mixins.scss');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(partial, '');

    const resolved = resolveImport(from, './mixins', { root, extensions: ['.scss', '.css'] });
    expect(resolved).toBe(partial);
  }));

  it('prefers non-partial over partial SCSS files', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'main.scss');
    const regular = path.join(root, 'src', 'mixins.scss');
    const partial = path.join(root, 'src', '_mixins.scss');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(regular, '');
    fs.writeFileSync(partial, '');

    const resolved = resolveImport(from, './mixins', { root, extensions: ['.scss', '.css'] });
    expect(resolved).toBe(regular);
  }));

  it('resolves SCSS partial with exact _filename match (no extension added)', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'main.scss');
    const partial = path.join(root, 'src', '_helpers.scss');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(partial, '');

    // Import specifier already includes extension
    const resolved = resolveImport(from, './helpers.scss', { root, extensions: ['.scss'] });
    // The exact file doesn't exist, so it should try _helpers.scss
    expect(resolved).toBe(partial);
  }));

  it('resolves directory with index.tsx fallback', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    const dir = path.join(root, 'src', 'components');
    const indexFile = path.join(dir, 'index.tsx');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(indexFile, '');

    const resolved = resolveImport(from, './components', { root });
    expect(resolved).toBe(indexFile);
  }));

  it('prefers file-with-extension over directory-with-index (webpack compat)', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    // Create both utils.js (file) and utils/index.js (directory with index)
    const utilsFile = path.join(root, 'src', 'utils.js');
    const utilsDir = path.join(root, 'src', 'utils');
    const utilsIndex = path.join(utilsDir, 'index.js');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.mkdirSync(utilsDir, { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(utilsFile, '');
    fs.writeFileSync(utilsIndex, '');

    const resolved = resolveImport(from, './utils', { root });
    expect(resolved).toBe(utilsFile);
  }));

  it('falls through to file-with-extension when directory has no index', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    // Create utils.js (file) and utils/ (directory WITHOUT index)
    const utilsFile = path.join(root, 'src', 'utils.js');
    const utilsDir = path.join(root, 'src', 'utils');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.mkdirSync(utilsDir, { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(utilsFile, '');
    // Put a non-index file in the directory to ensure it exists
    fs.writeFileSync(path.join(utilsDir, 'helper.js'), '');

    const resolved = resolveImport(from, './utils', { root });
    expect(resolved).toBe(utilsFile);
  }));
});


