import fs from 'node:fs';
import path from 'node:path';
import { loadCodereapConfig, mergeResolutionOptions, loadTsJsConfig } from '../../src/config';
import { withTempDir } from '../helpers/withTempDir';

describe('config.loadCodereapConfig', () => {
  it('defaults and normalizes relative paths', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ root: '.', importRoot: 'src', out: 'rep', aliases: { '@/*': 'src/*' } }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.root).toBe(root);
    expect(cfg.importRoot).toBe(path.join(root, 'src'));
    expect(cfg.out).toBe('rep');
    expect(cfg.paths).toEqual({ '@/*': ['src/*'] });
  }));

  it('no file config present falls back to defaults', () => withTempDir('config-', (root) => {
    const cfg = loadCodereapConfig(root);
    expect(cfg.root).toBe(root);
    expect(cfg.exclude).toEqual([]);
  }));
});

describe('config.mergeResolutionOptions', () => {
  it('applies precedence CLI > file > ts/jsconfig', () => {
    const root = '/x';
    const merged = mergeResolutionOptions(
      root,
      { importRoot: '/cli', paths: { a: ['cli'] } },
      { importRoot: '/file', paths: { a: ['file'] } },
      { baseUrl: '/ts', paths: { a: ['ts'] } },
    );
    expect(merged.importRoot).toBe('/cli');
    expect(merged.paths).toEqual({ a: ['cli'] });
    expect(merged.root).toBe(path.resolve(root));
  });
});

describe('config.loadCodereapConfig alwaysLive', () => {
  it('loads alwaysLive globs from config file', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      alwaysLive: ['locales/**/*.json', '**/*.d.ts'],
    }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.alwaysLive).toEqual(['locales/**/*.json', '**/*.d.ts']);
  }));

  it('returns undefined alwaysLive when not present in config', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ root: '.' }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.alwaysLive).toBeUndefined();
  }));

  it('returns undefined alwaysLive for empty array', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ alwaysLive: [] }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.alwaysLive).toBeUndefined();
  }));
});

describe('config.loadCodereapConfig implicitEdges', () => {
  it('resolves implicitEdges keys to absolute paths', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      implicitEdges: {
        'server/api/apiConfiguration.js': ['server/configs/*.js'],
        'src/loader.ts': ['src/modules/*.ts', 'src/plugins/*.ts'],
      }
    }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.implicitEdges).toBeDefined();
    expect(cfg.implicitEdges![path.resolve(root, 'server/api/apiConfiguration.js')]).toEqual(['server/configs/*.js']);
    expect(cfg.implicitEdges![path.resolve(root, 'src/loader.ts')]).toEqual(['src/modules/*.ts', 'src/plugins/*.ts']);
  }));

  it('returns undefined implicitEdges when not present in config', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ root: '.' }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.implicitEdges).toBeUndefined();
  }));

  it('ignores implicitEdges entries with non-array values', () => withTempDir('config-', (root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      implicitEdges: {
        'valid.js': ['*.js'],
        'invalid.js': 'not-an-array',
      }
    }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.implicitEdges).toBeDefined();
    expect(Object.keys(cfg.implicitEdges!)).toHaveLength(1);
    expect(cfg.implicitEdges![path.resolve(root, 'valid.js')]).toEqual(['*.js']);
  }));
});

describe('config.loadTsJsConfig', () => {
  it('reads baseUrl and paths from tsconfig.json', () => withTempDir('config-', (root) => {
    const tsconfig = {
      compilerOptions: {
        baseUrl: 'src',
        paths: { '@/*': ['src/*'] },
      },
    };
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
    const cfg = loadTsJsConfig(root);
    expect(cfg.baseUrl).toBe(path.join(root, 'src'));
    expect(cfg.paths).toEqual({ '@/*': ['src/*'] });
  }));
});


