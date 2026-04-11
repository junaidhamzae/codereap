import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseFile } from '../../src/parser';

function withTempDir(run: (dir: string) => Promise<void> | void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-glob-'));
  const res = run(dir);
  if (res && typeof (res as any).then === 'function') {
    return (res as Promise<void>).finally(() => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('parser glob imports', () => {
  it('captures glob.sync() with string literal pattern', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.js');
    fs.writeFileSync(file, [
      "const glob = require('glob');",
      "const files = glob.sync('./configs/*.js');",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(['./configs/*.js']);
  }));

  it('captures glob.globSync() with string literal pattern', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.js');
    fs.writeFileSync(file, [
      "const glob = require('glob');",
      "const files = glob.globSync('./routes/**/*.ts');",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(['./routes/**/*.ts']);
  }));

  it('captures destructured globSync() call', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.ts');
    fs.writeFileSync(file, [
      "const { globSync } = require('glob');",
      "const files = globSync('./modules/*.ts');",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(['./modules/*.ts']);
  }));

  it('captures fg.sync() (fast-glob alias)', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.ts');
    fs.writeFileSync(file, [
      "const fg = require('fast-glob');",
      "const files = fg.sync('./pages/**/*.tsx');",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(['./pages/**/*.tsx']);
  }));

  it('captures multiple glob patterns in the same file', async () => withTempDir(async (root) => {
    const file = path.join(root, 'multi.js');
    fs.writeFileSync(file, [
      "const glob = require('glob');",
      "const configs = glob.sync('./configs/*.js');",
      "const routes = glob.sync('./routes/*.js');",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(expect.arrayContaining([
      './configs/*.js',
      './routes/*.js',
    ]));
    expect(parsed.globImports).toHaveLength(2);
  }));

  it('returns empty globImports when no glob calls are present', async () => withTempDir(async (root) => {
    const file = path.join(root, 'plain.js');
    fs.writeFileSync(file, "const x = require('./foo');");
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual([]);
  }));

  it('resolves glob.sync with const variable via constant propagation', async () => withTempDir(async (root) => {
    const file = path.join(root, 'dynamic.js');
    fs.writeFileSync(file, [
      "const glob = require('glob');",
      "const pattern = './configs/*.js';",
      "const files = glob.sync(pattern);",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(['./configs/*.js']);
  }));

  it('ignores glob.sync with non-const non-literal argument', async () => withTempDir(async (root) => {
    const file = path.join(root, 'dynamic.js');
    fs.writeFileSync(file, [
      "const glob = require('glob');",
      "let pattern = getPattern();",
      "const files = glob.sync(pattern);",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual([]);
  }));

  it('returns empty globImports for non-script files', async () => withTempDir(async (root) => {
    const file = path.join(root, 'data.json');
    fs.writeFileSync(file, '{"key": "value"}');
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual([]);
  }));
});

describe('cross-file constant propagation', () => {
  it('records unresolvedGlobRefs when glob uses a CJS imported identifier', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.js');
    fs.writeFileSync(file, [
      "const { PATTERN } = require('./constants');",
      "const glob = require('glob');",
      "const files = glob.sync(PATTERN);",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual([]);
    expect(parsed.unresolvedGlobRefs).toEqual([
      { identifier: 'PATTERN', importSource: './constants' },
    ]);
  }));

  it('records unresolvedGlobRefs when glob uses an ESM imported identifier', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.ts');
    fs.writeFileSync(file, [
      "import { CONFIG_GLOB } from './constants';",
      "import glob from 'glob';",
      "const files = glob.sync(CONFIG_GLOB);",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual([]);
    expect(parsed.unresolvedGlobRefs).toEqual([
      { identifier: 'CONFIG_GLOB', importSource: './constants' },
    ]);
  }));

  it('records unresolvedGlobRefs for globSync with imported identifier', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.js');
    fs.writeFileSync(file, [
      "const { globSync } = require('glob');",
      "const { FILES_GLOB } = require('./config');",
      "const files = globSync(FILES_GLOB);",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual([]);
    expect(parsed.unresolvedGlobRefs).toEqual([
      { identifier: 'FILES_GLOB', importSource: './config' },
    ]);
  }));

  it('does not record unresolvedGlobRefs when const is resolved locally', async () => withTempDir(async (root) => {
    const file = path.join(root, 'loader.js');
    fs.writeFileSync(file, [
      "const glob = require('glob');",
      "const PATTERN = './configs/*.js';",
      "const files = glob.sync(PATTERN);",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.globImports).toEqual(['./configs/*.js']);
    expect(parsed.unresolvedGlobRefs).toEqual([]);
  }));

  it('exports namedConstValues for export const with string literal', async () => withTempDir(async (root) => {
    const file = path.join(root, 'constants.ts');
    fs.writeFileSync(file, [
      "export const GLOB_PATTERN = './server/configs/*.js';",
      "export const NOT_STRING = 42;",
      "export const ANOTHER = './routes/**/*.ts';",
    ].join('\n'));
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportsInfo).toBeDefined();
    expect(parsed.exportsInfo!.namedConstValues).toEqual({
      GLOB_PATTERN: './server/configs/*.js',
      ANOTHER: './routes/**/*.ts',
    });
  }));

  it('exports namedConstValues for re-exported const strings via export { X }', async () => withTempDir(async (root) => {
    const file = path.join(root, 'constants.ts');
    fs.writeFileSync(file, [
      "const MY_GLOB = './plugins/*.js';",
      "export { MY_GLOB };",
    ].join('\n'));
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportsInfo).toBeDefined();
    expect(parsed.exportsInfo!.namedConstValues).toEqual({
      MY_GLOB: './plugins/*.js',
    });
  }));

  it('exports namedConstValues for module.exports style not tracked (CJS limitation)', async () => withTempDir(async (root) => {
    const file = path.join(root, 'constants.js');
    fs.writeFileSync(file, [
      "const PATTERN = './configs/*.js';",
      "module.exports = { PATTERN };",
    ].join('\n'));
    const parsed = await parseFile(file, { collectSymbols: true });
    // CJS module.exports = {} is not tracked as named exports
    expect(parsed.exportsInfo?.namedConstValues).toBeUndefined();
  }));
});

describe('SCSS @import/@use/@forward parsing', () => {
  it('extracts @import from .scss file', async () => withTempDir(async (root) => {
    const file = path.join(root, 'styles.scss');
    fs.writeFileSync(file, "@import 'foo';");
    const parsed = await parseFile(file);
    expect(parsed.imports).toContain('foo');
  }));

  it('extracts @use from .scss file', async () => withTempDir(async (root) => {
    const file = path.join(root, 'styles.scss');
    fs.writeFileSync(file, "@use 'bar';");
    const parsed = await parseFile(file);
    expect(parsed.imports).toContain('bar');
  }));

  it('extracts @forward from .scss file', async () => withTempDir(async (root) => {
    const file = path.join(root, 'styles.scss');
    fs.writeFileSync(file, "@forward 'baz';");
    const parsed = await parseFile(file);
    expect(parsed.imports).toContain('baz');
  }));

  it('extracts multiple directives from one .scss file', async () => withTempDir(async (root) => {
    const file = path.join(root, 'theme.scss');
    fs.writeFileSync(file, [
      "@import 'variables';",
      "@use 'mixins';",
      "@forward 'colors';",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.imports).toEqual(expect.arrayContaining(['variables', 'mixins', 'colors']));
    expect(parsed.imports).toHaveLength(3);
  }));

  it('returns empty imports for CSS without @import', async () => withTempDir(async (root) => {
    const file = path.join(root, 'plain.css');
    fs.writeFileSync(file, 'body { color: red; }');
    const parsed = await parseFile(file);
    expect(parsed.imports).toEqual([]);
  }));

  it('extracts @import from .css file', async () => withTempDir(async (root) => {
    const file = path.join(root, 'styles.css');
    fs.writeFileSync(file, "@import 'reset';");
    const parsed = await parseFile(file);
    expect(parsed.imports).toContain('reset');
  }));

  it('returns collectSymbols fields for stylesheet files', async () => withTempDir(async (root) => {
    const file = path.join(root, 'styles.scss');
    fs.writeFileSync(file, "@use 'theme';");
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.imports).toContain('theme');
    expect(parsed.importSpecs).toEqual([]);
    expect(parsed.exportsInfo).toBeDefined();
  }));
});

describe('path.join/path.resolve detection', () => {
  it('detects path.join(__dirname, ...) and returns resolved pathRefs', async () => withTempDir(async (root) => {
    const file = path.join(root, 'server.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const p = path.join(__dirname, 'public', 'sw.js');",
    ].join('\n'));
    const parsed = await parseFile(file);
    const expected = path.join(root, 'public', 'sw.js');
    expect(parsed.pathRefs).toBeDefined();
    expect(parsed.pathRefs).toContain(expected);
  }));

  it('detects path.resolve(__dirname, ...) and returns resolved pathRefs', async () => withTempDir(async (root) => {
    const file = path.join(root, 'server.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const p = path.resolve(__dirname, 'server/logger.js');",
    ].join('\n'));
    const parsed = await parseFile(file);
    const expected = path.resolve(root, 'server/logger.js');
    expect(parsed.pathRefs).toBeDefined();
    expect(parsed.pathRefs).toContain(expected);
  }));

  it('does NOT include path.join with non-resolvable arguments in pathRefs', async () => withTempDir(async (root) => {
    const file = path.join(root, 'server.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const p = path.join(someVariable, 'foo');",
    ].join('\n'));
    const parsed = await parseFile(file);
    expect(parsed.pathRefs).toBeUndefined();
  }));

  it('resolves path.join with const propagation', async () => withTempDir(async (root) => {
    const file = path.join(root, 'server.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const dir = 'public';",
      "const p = path.join(__dirname, dir, 'sw.js');",
    ].join('\n'));
    const parsed = await parseFile(file);
    const expected = path.join(root, 'public', 'sw.js');
    expect(parsed.pathRefs).toBeDefined();
    expect(parsed.pathRefs).toContain(expected);
  }));

  it('returns pathRefs in collectSymbols mode too', async () => withTempDir(async (root) => {
    const file = path.join(root, 'server.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const p = path.join(__dirname, 'assets', 'main.js');",
    ].join('\n'));
    const parsed = await parseFile(file, { collectSymbols: true });
    const expected = path.join(root, 'assets', 'main.js');
    expect(parsed.pathRefs).toBeDefined();
    expect(parsed.pathRefs).toContain(expected);
  }));

  it('detects path.join with only string literals (no __dirname)', async () => withTempDir(async (root) => {
    const file = path.join(root, 'build.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const p = path.join('dist', 'bundle.js');",
    ].join('\n'));
    const parsed = await parseFile(file);
    const expected = path.join('dist', 'bundle.js');
    expect(parsed.pathRefs).toBeDefined();
    expect(parsed.pathRefs).toContain(expected);
  }));

  it('detects path.join with template literal argument (no expressions)', async () => withTempDir(async (root) => {
    const file = path.join(root, 'helper.js');
    fs.writeFileSync(file, [
      "const path = require('path');",
      "const p = path.join(__dirname, `../../public/snapshots/data.json`);",
    ].join('\n'));
    const parsed = await parseFile(file);
    const expected = path.resolve(root, '../../public/snapshots/data.json');
    expect(parsed.pathRefs).toBeDefined();
    expect(parsed.pathRefs).toContain(expected);
  }));
});
