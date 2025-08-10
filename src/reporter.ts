import * as fs from 'fs/promises';
import path from 'path';
import { Graph } from './grapher';
import type { ExportInfo, ImportSpecifierInfo } from './parser';

export async function reportGraph(
  graph: Graph,
  outPath: string,
  projectRoot: string,
  onlyOrphans?: boolean,
  liveFiles?: Set<string>,
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
  >,
  consumptionIndex?: Map<
    string,
    {
      defaultConsumed: boolean;
      namespaceConsumed: boolean;
      namedConsumed: Set<string>;
    }
  >,
  exportUsageMap?: Map<
    string,
    | {
        default?: { exists: boolean; localName?: string; referencedInFile: boolean };
        named: Record<string, { localName?: string; referencedInFile: boolean; reexport?: boolean }>;
      }
    | undefined
  >,
  entrypointSet?: Set<string>
): Promise<string | undefined> {
  // Always write JSON

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

  // Build per-node records with requested fields and root-relative node paths
  let records: Array<{ [key: string]: any }> = nodes.map(nodeAbs => {
    const node = path.relative(projectRoot, nodeAbs);
    const inDeg = inDegreeMap[nodeAbs] ?? 0;
    const orphan = liveFiles ? !liveFiles.has(nodeAbs) : inDeg === 0;
    const base: { [key: string]: any } = {
      node,
      exists: true,
      'in-degree': inDeg,
      orphan,
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

  if (onlyOrphans) {
    records = records.filter(r => Boolean(r['orphan']));
  }

  const jsonString = JSON.stringify(records, null, 2);
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
  outPath: string,
  projectRoot: string,
  onlyOrphans?: boolean,
  liveFiles?: Set<string>
): Promise<string | undefined> {
  // Always write JSON

  let records = computeDirectoryRecords(graph, projectRoot, liveFiles);
  if (onlyOrphans) {
    records = records.filter(r => r.orphan);
  }

  const jsonString = JSON.stringify(records, null, 2);
  const jsonPath = `${outPath}.json`;
  await fs.writeFile(jsonPath, jsonString);
  return jsonPath;
}

