import * as fs from 'fs/promises';
import path from 'path';
import { Graph } from './grapher';
import type { EdgeType } from './grapher';
import type { ExportInfo, ImportSpecifierInfo } from './parser';

export interface ReportMetadata {
  version: string;
  timestamp: string;
  root: string;
  entrypoints: string[];
  'total-files': number;
  'orphan-count': number;
  'live-count': number;
}

export interface ReportGraphOptions {
  outPath: string;
  projectRoot: string;
  onlyOrphans?: boolean;
  liveFiles?: Set<string>;
  symbols?: Map<
    string,
    {
      exports: ExportInfo;
      importSpecs: (ImportSpecifierInfo & { resolved?: string })[];
      exportUsage?: {
        default?: { exists: boolean; localName?: string; referencedInFile: boolean };
        named: Record<string, { localName?: string; referencedInFile: boolean; reexport?: boolean }>;
      };
    }
  >;
  consumptionIndex?: Map<
    string,
    {
      defaultConsumed: boolean;
      namespaceConsumed: boolean;
      namedConsumed: Set<string>;
    }
  >;
  exportUsageMap?: Map<
    string,
    | {
        default?: { exists: boolean; localName?: string; referencedInFile: boolean };
        named: Record<string, { localName?: string; referencedInFile: boolean; reexport?: boolean }>;
      }
    | undefined
  >;
  entrypointSet?: Set<string>;
  packageVersion?: string;
}

export interface ReportDirectoriesOptions {
  outPath: string;
  projectRoot: string;
  onlyOrphans?: boolean;
  liveFiles?: Set<string>;
  packageVersion?: string;
}

export async function reportGraph(
  graph: Graph,
  options: ReportGraphOptions
): Promise<string | undefined> {
  const {
    outPath, projectRoot, onlyOrphans, liveFiles,
    symbols, consumptionIndex, exportUsageMap,
    entrypointSet, packageVersion,
  } = options;
  // Always write JSON

  // Precompute file sizes for all nodes (best-effort)
  const sizeByNode = new Map<string, number>();
  await Promise.all(
    Array.from(graph.nodes).map(async (abs) => {
      try {
        const st = await fs.stat(abs);
        sizeByNode.set(abs, typeof st.size === 'number' ? st.size : 0);
      } catch {
        // ignore missing files
      }
    })
  );

  // Compute in-degree for every node in the graph
  const nodes = Array.from(graph.nodes);
  const inDegreeMap: Record<string, number> = Object.create(null);
  for (const node of nodes) {
    inDegreeMap[node] = 0;
  }
  for (const [, to] of graph.edges) {
    if (to in inDegreeMap) {
      inDegreeMap[to] += 1;
    }
  }

  // Build imported-by map: file → [{file, type}]
  const importedByMap = new Map<string, Array<{ file: string; type: EdgeType }>>();
  for (const [from, to] of graph.edges) {
    if (!importedByMap.has(to)) importedByMap.set(to, []);
    importedByMap.get(to)!.push({
      file: from,
      type: graph.getEdgeType(from, to),
    });
  }

  // Build entrypoint reachability map: file → set of entrypoints that reach it
  const fileEntrypoints = new Map<string, Set<string>>();
  if (liveFiles && entrypointSet) {
    // BFS from each entrypoint separately to track which entrypoints reach which files
    const forwardAdj = new Map<string, string[]>();
    for (const [from, to] of graph.edges) {
      if (!forwardAdj.has(from)) forwardAdj.set(from, []);
      forwardAdj.get(from)!.push(to);
    }

    for (const ep of entrypointSet) {
      if (!graph.nodes.has(ep)) continue;
      const visited = new Set<string>();
      const queue = [ep];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        if (!fileEntrypoints.has(current)) fileEntrypoints.set(current, new Set());
        fileEntrypoints.get(current)!.add(ep);
        const neighbors = forwardAdj.get(current) || [];
        for (const next of neighbors) {
          if (!visited.has(next)) queue.push(next);
        }
      }
    }
  }

  // Build per-node records with requested fields and root-relative node paths
  let records: Array<{ [key: string]: any }> = nodes.map(nodeAbs => {
    const node = path.relative(projectRoot, nodeAbs);
    const inDeg = inDegreeMap[nodeAbs] ?? 0;
    const orphan = liveFiles ? !liveFiles.has(nodeAbs) : inDeg === 0;
    const base: { [key: string]: any } = {
      node,
      exists: true,
      'in-degree': inDeg,
      'imported-by': (importedByMap.get(nodeAbs) || []).map(imp => ({
        file: path.relative(projectRoot, imp.file),
        type: imp.type,
      })),
      entrypoints: fileEntrypoints.has(nodeAbs)
        ? Array.from(fileEntrypoints.get(nodeAbs)!).map(ep => path.relative(projectRoot, ep)).sort()
        : [],
      orphan,
      'size-bytes': sizeByNode.get(nodeAbs) ?? null,
    };

    if (symbols) {
      const info = symbols.get(nodeAbs);
      if (info) {
        // Compute exports usage and orphan flags
        const usage = (exportUsageMap && exportUsageMap.get(nodeAbs)) || info.exportUsage || { named: {} };
        const cons = (consumptionIndex && consumptionIndex.get(nodeAbs)) || {
          defaultConsumed: false,
          namespaceConsumed: false,
          namedConsumed: new Set<string>(),
        };

        const namedSet = new Set<string>(info.exports.named || []);
        for (const r of info.exports.reExports || []) {
          if (r.named) {
            for (const nm of r.named) namedSet.add(nm);
          }
        }
        const namedArray = Array.from(namedSet);

        const defaultReferenced = Boolean(usage.default && usage.default.referencedInFile);
        const defaultExternally = Boolean(cons.defaultConsumed);

        const exportsOut: any = {
          default: {
            exists: Boolean(info.exports.hasDefault),
            referencedInFile: defaultReferenced,
            orphan: !defaultReferenced && !defaultExternally,
          },
          named: namedArray.map((n) => {
            const u = usage.named ? usage.named[n] : undefined;
            const referenced = Boolean(u && u.referencedInFile);
            const externally = Boolean(cons.namespaceConsumed || (cons.namedConsumed && cons.namedConsumed.has(n)));
            return {
              name: n,
              referencedInFile: referenced,
              orphan: !referenced && !externally,
              reexport: Boolean(u && u.reexport),
            };
          }),
          reExports: info.exports.reExports || [],
        };

        base.symbols = base.symbols || {};
        base.symbols.exports = exportsOut;

        // For orphan rows, include imports section and (with onlyOrphans) joined targets
        if (orphan) {
          const imports = info.importSpecs.map(spec => {
            const resolvedRel = spec.resolved
              ? path.relative(projectRoot, spec.resolved)
              : undefined;
            const item: any = {
              source: spec.source,
              resolved: resolvedRel,
              kind: spec.kind,
              imported: spec.imported,
            };
            if (onlyOrphans && spec.resolved && symbols.has(spec.resolved)) {
              const target = symbols.get(spec.resolved)!;
              item.target = {
                node: resolvedRel!,
                exports: target.exports,
              };
            }
            return item;
          });
          // Stable sort by source|resolved for determinism
          const sortedImports = imports.sort((a: any, b: any) => {
            const aKey = `${a.source}|${a.resolved ?? ''}`;
            const bKey = `${b.source}|${b.resolved ?? ''}`;
            return aKey.localeCompare(bKey);
          });
          base.symbols.imports = sortedImports;
        }
      }
    }

    return base;
  });

  // Sort records by node for determinism
  records.sort((a, b) => String(a.node).localeCompare(String(b.node)));

  // Compute counts from the full (unfiltered) records
  const orphanCount = records.filter(r => Boolean(r['orphan'])).length;
  const liveCount = records.length - orphanCount;

  if (onlyOrphans) {
    records = records.filter(r => Boolean(r['orphan']));
  }

  // Build report with metadata wrapper
  const report: { [key: string]: any } = {
    version: packageVersion || 'unknown',
    timestamp: new Date().toISOString(),
    root: projectRoot,
    entrypoints: entrypointSet
      ? Array.from(entrypointSet).map(ep => path.relative(projectRoot, ep)).sort()
      : [],
    'total-files': nodes.length,
    'orphan-count': orphanCount,
    'live-count': liveCount,
    files: records,
  };

  const jsonString = JSON.stringify(report, null, 2);
  const jsonPath = `${outPath}.json`;
  await fs.writeFile(jsonPath, jsonString);
  return jsonPath;
}

export type DirectoryRecord = {
  directory: string;
  'file-count': number;
  'external-in-degree': number;
  orphan: boolean;
};

export function computeDirectoryRecords(
  graph: Graph,
  projectRoot: string,
  liveFiles?: Set<string>
): DirectoryRecord[] {
  const dirOf = (absPath: string): string => {
    const relDir = path.relative(projectRoot, path.dirname(absPath)) || '.';
    return relDir;
  };

  const fileCount: Record<string, number> = Object.create(null);
  const externalIn: Record<string, number> = Object.create(null);
  const liveFileCount: Record<string, number> = Object.create(null);

  for (const node of graph.nodes) {
    const d = dirOf(node);
    fileCount[d] = (fileCount[d] || 0) + 1;
    if (!(d in externalIn)) externalIn[d] = 0;
    if (liveFiles && liveFiles.has(node)) {
      liveFileCount[d] = (liveFileCount[d] || 0) + 1;
    }
  }

  for (const [from, to] of graph.edges) {
    const fromDir = dirOf(from);
    const toDir = dirOf(to);
    if (fromDir !== toDir) {
      externalIn[toDir] = (externalIn[toDir] || 0) + 1;
    }
  }

  const allDirs = Object.keys(fileCount);
  const records: DirectoryRecord[] = allDirs.map((directory) => {
    const fc = fileCount[directory] || 0;
    const inDeg = externalIn[directory] || 0;
    const liveInDir = liveFiles ? (liveFileCount[directory] || 0) : 0;
    return {
      directory,
      'file-count': fc,
      'external-in-degree': inDeg,
      orphan: fc > 0 && inDeg === 0 && (liveFiles ? liveInDir === 0 : true),
    };
  });

  return records;
}

export async function reportDirectories(
  graph: Graph,
  options: ReportDirectoriesOptions
): Promise<string | undefined> {
  const { outPath, projectRoot, onlyOrphans, liveFiles, packageVersion } = options;
  // Always write JSON

  let records = computeDirectoryRecords(graph, projectRoot, liveFiles);

  // Compute directory sizes by summing file sizes (best-effort)
  const dirSizes: Record<string, number> = Object.create(null);
  await Promise.all(
    Array.from(graph.nodes).map(async (abs) => {
      try {
        const st = await fs.stat(abs);
        const size = typeof st.size === 'number' ? st.size : 0;
        const relDir = path.relative(projectRoot, path.dirname(abs)) || '.';
        dirSizes[relDir] = (dirSizes[relDir] || 0) + size;
      } catch {
        // ignore missing files
      }
    })
  );
  records = records.map((r) => ({ ...r, 'size-bytes': dirSizes[r.directory] || 0 }));

  // Compute counts from the full (unfiltered) records before filtering
  const totalDirectories = records.length;
  const orphanCount = records.filter(r => r.orphan).length;
  const liveCount = totalDirectories - orphanCount;

  if (onlyOrphans) {
    records = records.filter(r => r.orphan);
  }

  // Build report with metadata wrapper
  const report: { [key: string]: any } = {
    version: packageVersion || 'unknown',
    timestamp: new Date().toISOString(),
    root: projectRoot,
    'total-directories': totalDirectories,
    'orphan-count': orphanCount,
    'live-count': liveCount,
    directories: records,
  };

  const jsonString = JSON.stringify(report, null, 2);
  const jsonPath = `${outPath}.json`;
  await fs.writeFile(jsonPath, jsonString);
  return jsonPath;
}
