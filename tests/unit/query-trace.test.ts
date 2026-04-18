import path from 'node:path';
import {
  traceFile,
  formatTraceResult,
  traceResultToJSON,
  FileNotInAnalysisError,
  TraceResultLive,
  TraceResultOrphan,
} from '../../src/query';
import type { CacheData } from '../../src/cache';

const root = '/project';

function makeCache(overrides: Partial<CacheData> = {}): CacheData {
  return {
    version: '0.13.0',
    timestamp: '2026-04-13T00:00:00.000Z',
    root,
    entrypoints: ['/project/src/index.ts'],
    files: [
      '/project/src/index.ts',
      '/project/src/routes.ts',
      '/project/src/utils.ts',
      '/project/src/dead.ts',
      '/project/src/also-dead.ts',
    ],
    edges: [
      { from: '/project/src/index.ts', to: '/project/src/routes.ts', type: 'static-import' },
      { from: '/project/src/routes.ts', to: '/project/src/utils.ts', type: 'static-import' },
    ],
    reachable: ['/project/src/index.ts', '/project/src/routes.ts', '/project/src/utils.ts'],
    orphans: ['/project/src/dead.ts', '/project/src/also-dead.ts'],
    ...overrides,
  };
}

describe('traceFile', () => {
  it('traces a live file with chain', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/utils.ts', cache, root) as TraceResultLive;

    expect(result.status).toBe('live');
    expect(result.entrypoints).toEqual(['/project/src/index.ts']);
    expect(result.chains.length).toBeGreaterThanOrEqual(1);
    // Chain should be: index.ts → routes.ts → utils.ts
    expect(result.chains[0].path).toEqual([
      '/project/src/index.ts',
      '/project/src/routes.ts',
      '/project/src/utils.ts',
    ]);
    expect(result.chains[0].edgeTypes).toEqual(['static-import', 'static-import']);
  });

  it('traces a live entrypoint file', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/index.ts', cache, root) as TraceResultLive;

    expect(result.status).toBe('live');
    expect(result.entrypoints).toEqual(['/project/src/index.ts']);
    // Entrypoint chain is just itself
    expect(result.chains.length).toBe(1);
    expect(result.chains[0].path).toEqual(['/project/src/index.ts']);
    expect(result.chains[0].edgeTypes).toEqual([]);
  });

  it('traces an orphan file', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/dead.ts', cache, root) as TraceResultOrphan;

    expect(result.status).toBe('orphan');
    expect(result.importers).toEqual([]);
    expect(result.directoryOrphanRatio).toBeCloseTo(0.4); // 2 out of 5 files orphan
  });

  it('accepts relative paths', () => {
    const cache = makeCache();
    const result = traceFile('src/utils.ts', cache, root);
    expect(result.status).toBe('live');
  });

  it('throws FileNotInAnalysisError for unknown files', () => {
    const cache = makeCache();
    expect(() => traceFile('/project/src/nonexistent.ts', cache, root)).toThrow(
      FileNotInAnalysisError
    );
  });

  it('finds multiple chains from different entrypoints', () => {
    const cache = makeCache({
      entrypoints: ['/project/src/index.ts', '/project/src/routes.ts'],
      reachable: ['/project/src/index.ts', '/project/src/routes.ts', '/project/src/utils.ts'],
    });
    const result = traceFile('/project/src/utils.ts', cache, root) as TraceResultLive;

    expect(result.status).toBe('live');
    expect(result.entrypoints.length).toBe(2);
    expect(result.chains.length).toBe(2);
    // Shortest chain first
    expect(result.chains[0].path).toEqual([
      '/project/src/routes.ts',
      '/project/src/utils.ts',
    ]);
  });

  it('reports importers for orphan files with incoming edges from other orphans', () => {
    const cache = makeCache({
      edges: [
        { from: '/project/src/index.ts', to: '/project/src/routes.ts', type: 'static-import' },
        { from: '/project/src/routes.ts', to: '/project/src/utils.ts', type: 'static-import' },
        { from: '/project/src/dead.ts', to: '/project/src/also-dead.ts', type: 'static-import' },
      ],
    });
    const result = traceFile('/project/src/also-dead.ts', cache, root) as TraceResultOrphan;

    expect(result.status).toBe('orphan');
    expect(result.importers).toEqual([
      { file: '/project/src/dead.ts', type: 'static-import' },
    ]);
  });

  it('adds notes about dynamic imports when they exist', () => {
    const cache = makeCache({
      edges: [
        { from: '/project/src/index.ts', to: '/project/src/routes.ts', type: 'static-import' },
        { from: '/project/src/routes.ts', to: '/project/src/utils.ts', type: 'dynamic-import' },
      ],
    });
    const result = traceFile('/project/src/dead.ts', cache, root) as TraceResultOrphan;

    expect(result.notes.some(n => n.includes('dynamic imports'))).toBe(true);
  });

  it('adds notes about convention-like filenames', () => {
    const cache = makeCache({
      files: [...makeCache().files, '/project/src/middleware.ts'],
      orphans: ['/project/src/dead.ts', '/project/src/also-dead.ts', '/project/src/middleware.ts'],
    });
    const result = traceFile('/project/src/middleware.ts', cache, root) as TraceResultOrphan;

    expect(result.notes.some(n => n.includes('convention-based'))).toBe(true);
  });

  it('adds notes when entire directory is orphan', () => {
    const cache: CacheData = {
      version: '0.13.0',
      timestamp: '2026-04-13T00:00:00.000Z',
      root,
      entrypoints: ['/project/src/index.ts'],
      files: ['/project/src/index.ts', '/project/legacy/a.ts', '/project/legacy/b.ts'],
      edges: [],
      reachable: ['/project/src/index.ts'],
      orphans: ['/project/legacy/a.ts', '/project/legacy/b.ts'],
    };
    const result = traceFile('/project/legacy/a.ts', cache, root) as TraceResultOrphan;

    expect(result.directoryOrphanRatio).toBe(1.0);
    expect(result.notes.some(n => n.includes('Entire directory'))).toBe(true);
  });
});

describe('formatTraceResult', () => {
  it('formats live result with chains', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/utils.ts', cache, root);
    const output = formatTraceResult(result, root);

    expect(output).toContain('STATUS: live');
    expect(output).toContain('KEPT ALIVE BY:');
    expect(output).toContain('CHAINS:');
    expect(output).toContain('src/index.ts');
    expect(output).toContain('static-import');
  });

  it('formats orphan result', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/dead.ts', cache, root);
    const output = formatTraceResult(result, root);

    expect(output).toContain('STATUS: orphan');
    expect(output).toContain('No file imports this module');
  });

  it('truncates chains when more than 5 without --all', () => {
    // Build a cache with many paths to one file
    const files = ['/project/src/target.ts'];
    const entrypoints: string[] = [];
    const edges: CacheData['edges'] = [];
    const reachable = ['/project/src/target.ts'];

    for (let i = 0; i < 8; i++) {
      const ep = `/project/src/ep${i}.ts`;
      files.push(ep);
      entrypoints.push(ep);
      reachable.push(ep);
      edges.push({ from: ep, to: '/project/src/target.ts', type: 'static-import' });
    }

    const cache: CacheData = {
      version: '0.13.0',
      timestamp: '2026-04-13T00:00:00.000Z',
      root,
      entrypoints,
      files,
      edges,
      reachable,
      orphans: [],
    };

    const result = traceFile('/project/src/target.ts', cache, root);
    const output = formatTraceResult(result, root);
    expect(output).toContain('showing first 5');
    expect(output).toContain('--all');

    const fullOutput = formatTraceResult(result, root, { showAll: true });
    expect(fullOutput).not.toContain('showing first 5');
  });

  it('truncates entrypoints when more than 5 without --all', () => {
    const files = ['/project/src/target.ts'];
    const entrypoints: string[] = [];
    const edges: CacheData['edges'] = [];
    const reachable = ['/project/src/target.ts'];

    for (let i = 0; i < 8; i++) {
      const ep = `/project/src/ep${i}.ts`;
      files.push(ep);
      entrypoints.push(ep);
      reachable.push(ep);
      edges.push({ from: ep, to: '/project/src/target.ts', type: 'static-import' });
    }

    const cache: CacheData = {
      version: '0.13.0',
      timestamp: '2026-04-13T00:00:00.000Z',
      root,
      entrypoints,
      files,
      edges,
      reachable,
      orphans: [],
    };

    const result = traceFile('/project/src/target.ts', cache, root);
    const output = formatTraceResult(result, root);
    expect(output).toContain('8 entrypoints');
  });
});

describe('traceResultToJSON', () => {
  it('returns structured JSON for live file', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/utils.ts', cache, root);
    const json = traceResultToJSON(result, root) as any;

    expect(json.file).toBe('src/utils.ts');
    expect(json.status).toBe('live');
    expect(json.entrypoints).toContain('src/index.ts');
    expect(json.chains[0].path[0]).toBe('src/index.ts');
    expect(json.importers[0].file).toBe('src/routes.ts');
  });

  it('returns structured JSON for orphan file', () => {
    const cache = makeCache();
    const result = traceFile('/project/src/dead.ts', cache, root);
    const json = traceResultToJSON(result, root) as any;

    expect(json.file).toBe('src/dead.ts');
    expect(json.status).toBe('orphan');
    expect(json.importers).toEqual([]);
    expect(json.notes).toBeDefined();
  });
});
