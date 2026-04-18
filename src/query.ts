import path from 'path';
import type { CacheData, CacheEdge } from './cache';
import type { EdgeType } from './grapher';

export interface TraceChain {
  /** Ordered list of files from entrypoint to the target file */
  path: string[];
  /** Edge types along the chain (length = path.length - 1) */
  edgeTypes: EdgeType[];
}

export interface TraceResultLive {
  file: string;
  status: 'live';
  entrypoints: string[];
  chains: TraceChain[];
  importers: Array<{ file: string; type: EdgeType }>;
  directoryOrphanRatio: number | null;
}

export interface TraceResultOrphan {
  file: string;
  status: 'orphan';
  importers: Array<{ file: string; type: EdgeType }>;
  directoryOrphanRatio: number | null;
  notes: string[];
}

export type TraceResult = TraceResultLive | TraceResultOrphan;

/**
 * Trace a file's reachability status using cached analysis data.
 *
 * For live files: finds all entrypoints that keep it alive and all import chains.
 * For orphan files: reports why it's unreachable with contextual notes.
 */
export function traceFile(
  filePath: string,
  cache: CacheData,
  projectRoot: string
): TraceResult {
  // Normalize: accept both relative and absolute paths
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectRoot, filePath);

  // Build lookup Sets from cache arrays (O(1) membership checks instead of O(n) .includes())
  const fileSet = new Set(cache.files);
  const orphanSet = new Set(cache.orphans);
  const reachableSet = new Set(cache.reachable);

  // Check the file exists in the analysis
  if (!fileSet.has(absPath)) {
    throw new FileNotInAnalysisError(
      `File "${path.relative(projectRoot, absPath)}" was not found in the analysis. ` +
        `It may be outside the scanned root or excluded by filters.`
    );
  }

  const isOrphan = orphanSet.has(absPath);

  // Build reverse adjacency (needed for both live and orphan paths)
  const reverseAdj = buildReverseAdjacency(cache.edges);

  // Get direct importers from reverse adjacency (avoids redundant linear scan)
  const importers = (reverseAdj.get(absPath) || []).map(({ source, type }) => ({
    file: source,
    type,
  }));

  // Compute directory orphan ratio (shared computation for both paths and orphan notes)
  const dirInfo = computeDirectoryInfo(absPath, cache, orphanSet);

  if (reachableSet.has(absPath) && !isOrphan) {
    // Find all entrypoints that reach this file
    const entrypointSet = new Set(cache.entrypoints);
    const chains = findAllChains(absPath, reverseAdj, entrypointSet);
    const reachingEntrypoints = [
      ...new Set(chains.map((c) => c.path[0])),
    ];

    return {
      file: absPath,
      status: 'live',
      entrypoints: reachingEntrypoints,
      chains,
      importers,
      directoryOrphanRatio: dirInfo.ratio,
    };
  } else {
    // Orphan file — gather notes (reuse dirInfo to avoid recomputation)
    const notes = buildOrphanNotes(absPath, cache, dirInfo);

    return {
      file: absPath,
      status: 'orphan',
      importers,
      directoryOrphanRatio: dirInfo.ratio,
      notes,
    };
  }
}

/**
 * Format a TraceResult for terminal display.
 */
export function formatTraceResult(
  result: TraceResult,
  projectRoot: string,
  options: { showAll?: boolean } = {}
): string {
  const rel = (p: string) => path.relative(projectRoot, p);
  const lines: string[] = [];

  lines.push(`FILE: ${rel(result.file)}`);
  lines.push('');

  if (result.status === 'live') {
    lines.push(`STATUS: live`);
    lines.push('');

    // Entrypoints
    if (result.entrypoints.length <= 5 || options.showAll) {
      lines.push('KEPT ALIVE BY:');
      for (const ep of result.entrypoints) {
        lines.push(`  • ${rel(ep)} (entrypoint)`);
      }
    } else {
      lines.push(`KEPT ALIVE BY: ${result.entrypoints.length} entrypoints`);
      for (const ep of result.entrypoints.slice(0, 5)) {
        lines.push(`  • ${rel(ep)} (entrypoint)`);
      }
      lines.push(
        `  ... and ${result.entrypoints.length - 5} more (run with --all to see all)`
      );
    }
    lines.push('');

    // Chains
    const maxChains = options.showAll ? result.chains.length : 5;
    const showCount = Math.min(result.chains.length, maxChains);

    if (result.chains.length <= maxChains) {
      lines.push('CHAINS:');
    } else {
      lines.push(
        `CHAINS: ${result.chains.length} paths (showing first ${showCount})`
      );
    }

    for (let i = 0; i < showCount; i++) {
      const chain = result.chains[i];
      lines.push(`  ${i + 1}. ${chain.path.map(rel).join(' → ')}`);
      lines.push(`     [${chain.edgeTypes.join(' → ')}]`);
    }

    if (result.chains.length > maxChains && !options.showAll) {
      lines.push('');
      lines.push(
        `  Run with --all to see all ${result.chains.length} chains.`
      );
    }
  } else {
    lines.push(`STATUS: orphan`);
    lines.push('');

    if (result.importers.length === 0) {
      lines.push('REASON: No file imports this module');
    } else {
      lines.push('IMPORTED BY (also orphan):');
      for (const imp of result.importers) {
        lines.push(`  • ${rel(imp.file)} [${imp.type}]`);
      }
    }

    if (result.directoryOrphanRatio !== null) {
      const pct = Math.round(result.directoryOrphanRatio * 100);
      const dir = path.relative(projectRoot, path.dirname(result.file));
      lines.push('');
      lines.push(`DIRECTORY: ${dir}/ (${pct}% orphan)`);
    }

    if (result.notes.length > 0) {
      lines.push('');
      lines.push('NOTES:');
      for (const note of result.notes) {
        lines.push(`  • ${note}`);
      }
    }
  }

  // Common: direct importers count
  if (result.status === 'live' && result.importers.length > 0) {
    lines.push('');
    lines.push(`DIRECT IMPORTERS: ${result.importers.length}`);
    const showImporters = options.showAll
      ? result.importers
      : result.importers.slice(0, 10);
    for (const imp of showImporters) {
      lines.push(`  • ${rel(imp.file)} [${imp.type}]`);
    }
    if (!options.showAll && result.importers.length > 10) {
      lines.push(
        `  ... and ${result.importers.length - 10} more (run with --all to see all)`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Format a TraceResult as a structured JSON object.
 */
export function traceResultToJSON(
  result: TraceResult,
  projectRoot: string
): object {
  const rel = (p: string) => path.relative(projectRoot, p);

  if (result.status === 'live') {
    return {
      file: rel(result.file),
      status: 'live',
      entrypoints: result.entrypoints.map(rel),
      chains: result.chains.map((c) => ({
        path: c.path.map(rel),
        edgeTypes: c.edgeTypes,
      })),
      importers: result.importers.map((i) => ({
        file: rel(i.file),
        type: i.type,
      })),
      directoryOrphanRatio: result.directoryOrphanRatio,
    };
  } else {
    return {
      file: rel(result.file),
      status: 'orphan',
      importers: result.importers.map((i) => ({
        file: rel(i.file),
        type: i.type,
      })),
      directoryOrphanRatio: result.directoryOrphanRatio,
      notes: result.notes,
    };
  }
}

// ────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────

function buildReverseAdjacency(
  edges: CacheEdge[]
): Map<string, Array<{ source: string; type: EdgeType }>> {
  const rev = new Map<string, Array<{ source: string; type: EdgeType }>>();
  for (const edge of edges) {
    if (!rev.has(edge.to)) rev.set(edge.to, []);
    rev.get(edge.to)!.push({ source: edge.from, type: edge.type });
  }
  return rev;
}

/**
 * Find all chains from entrypoints to a target file via DFS on reverse graph.
 * Uses DFS backtracking with cycle detection. Caps at 100 chains to avoid explosion.
 */
function findAllChains(
  target: string,
  reverseAdj: Map<string, Array<{ source: string; type: EdgeType }>>,
  entrypoints: Set<string>
): TraceChain[] {
  const chains: TraceChain[] = [];
  const MAX_CHAINS = 100;

  // DFS from target backwards to entrypoints
  function dfs(
    current: string,
    pathSoFar: string[],
    typesSoFar: EdgeType[],
    visited: Set<string>
  ) {
    if (chains.length >= MAX_CHAINS) return;

    if (entrypoints.has(current)) {
      // Found a chain — reverse it so it goes entrypoint → ... → target
      chains.push({
        path: [...pathSoFar].reverse(),
        edgeTypes: [...typesSoFar].reverse(),
      });
      // Don't return — an entrypoint might also be imported by another entrypoint
    }

    const parents = reverseAdj.get(current) || [];
    for (const { source, type } of parents) {
      if (visited.has(source)) continue;
      visited.add(source);
      pathSoFar.push(source);
      typesSoFar.push(type);
      dfs(source, pathSoFar, typesSoFar, visited);
      pathSoFar.pop();
      typesSoFar.pop();
      visited.delete(source);
    }
  }

  const visited = new Set<string>([target]);
  dfs(target, [target], [], visited);

  // Sort chains: shortest first, then alphabetically by first node
  chains.sort((a, b) => {
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    return a.path[0].localeCompare(b.path[0]);
  });

  return chains;
}

/** Shared directory info computed once and reused by both ratio and orphan notes */
interface DirectoryInfo {
  dir: string;
  filesInDir: string[];
  orphansInDir: string[];
  ratio: number | null;
  allOrphan: boolean;
}

function computeDirectoryInfo(
  file: string,
  cache: CacheData,
  orphanSet: Set<string>
): DirectoryInfo {
  const dir = path.dirname(file);
  const filesInDir = cache.files.filter((f) => path.dirname(f) === dir);
  if (filesInDir.length === 0) {
    return { dir, filesInDir, orphansInDir: [], ratio: null, allOrphan: false };
  }
  const orphansInDir = filesInDir.filter((f) => orphanSet.has(f));
  const ratio = orphansInDir.length / filesInDir.length;
  const allOrphan = orphansInDir.length === filesInDir.length;
  return { dir, filesInDir, orphansInDir, ratio, allOrphan };
}

function buildOrphanNotes(
  file: string,
  cache: CacheData,
  dirInfo: DirectoryInfo
): string[] {
  const notes: string[] = [];

  // Check if any edges in the project use dynamic-import type
  const hasDynamicImports = cache.edges.some(
    (e) => e.type === 'dynamic-import'
  );
  if (hasDynamicImports) {
    notes.push(
      'This project uses dynamic imports — some orphan files may be loaded at runtime via expressions that could not be statically resolved.'
    );
  }

  // Check if file looks like a convention file
  const basename = path.basename(file);
  const conventionPatterns = [
    /^middleware\./,
    /^instrumentation/,
    /\.config\./,
    /\.d\.ts$/,
    /^_app\./,
    /^_document\./,
    /\.stories\./,
    /\.story\./,
  ];
  if (conventionPatterns.some((p) => p.test(basename))) {
    notes.push(
      `Filename "${basename}" resembles a convention-based file. It may be loaded by a framework or tool without explicit imports. Consider adding it to alwaysLive if it is intentionally used.`
    );
  }

  // Check if entire directory is orphan (reuse precomputed dirInfo)
  if (dirInfo.allOrphan && dirInfo.filesInDir.length > 0) {
    const relDir = path.relative(cache.root, dirInfo.dir);
    notes.push(
      `Entire directory "${relDir}/" is orphan (${dirInfo.filesInDir.length} files). May be safe to remove as a unit.`
    );
  }

  return notes;
}

export class FileNotInAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotInAnalysisError';
  }
}
