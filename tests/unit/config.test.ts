import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadCodereapConfig, mergeResolutionOptions, loadTsJsConfig } from '../../src/config';

function withTempDir(run: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
  try { run(dir); } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

describe('config.loadCodereapConfig', () => {
  it('defaults and normalizes relative paths', () => withTempDir((root) => {
    const cfgPath = path.join(root, 'codereap.config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ root: '.', importRoot: 'src', out: 'rep', aliases: { '@/*': 'src/*' } }));
    const cfg = loadCodereapConfig(root);
    expect(cfg.root).toBe(root);
    expect(cfg.importRoot).toBe(path.join(root, 'src'));
    expect(cfg.out).toBe('rep');
    expect(cfg.paths).toEqual({ '@/*': ['src/*'] });
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

describe('config.loadTsJsConfig', () => {
  it('reads baseUrl and paths from tsconfig.json', () => withTempDir((root) => {
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


