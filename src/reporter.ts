import * as fs from 'fs/promises';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { Graph } from './grapher';

export async function reportGraph(
  graph: Graph,
  outPath: string,
  projectRoot: string,
  format?: 'json' | 'csv',
  onlyOrphans?: boolean
): Promise<string | undefined> {
  // If no format specified, do not write any file
  if (!format) return undefined;

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
  let records: Array<{ [key: string]: string | number | boolean }> = nodes.map(nodeAbs => {
    const node = path.relative(projectRoot, nodeAbs);
    const inDeg = inDegreeMap[nodeAbs] ?? 0;
    const orphan = inDeg === 0;
    return {
      node,
      exists: true,
      'in-degree': inDeg,
      orphan,
    };
  });

  if (onlyOrphans) {
    records = records.filter(r => Boolean(r['orphan']));
  }

  if (format === 'json') {
    const jsonString = JSON.stringify(records, null, 2);
    const jsonPath = `${outPath}.json`;
    await fs.writeFile(jsonPath, jsonString);
    return jsonPath;
  }

  if (format === 'csv') {
    const csvPath = `${outPath}.csv`;
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'node', title: 'node' },
        { id: 'exists', title: 'exists' },
        { id: 'in-degree', title: 'in-degree' },
        { id: 'orphan', title: 'orphan' },
      ],
    });
    await csvWriter.writeRecords(records);
    return csvPath;
  }

  return undefined;
}

export type DirectoryRecord = {
  directory: string;
  'file-count': number;
  'external-in-degree': number;
  orphan: boolean;
};

export function computeDirectoryRecords(graph: Graph, projectRoot: string): DirectoryRecord[] {
  const dirOf = (absPath: string): string => {
    const relDir = path.relative(projectRoot, path.dirname(absPath)) || '.';
    return relDir;
  };

  const fileCount: Record<string, number> = Object.create(null);
  const externalIn: Record<string, number> = Object.create(null);

  for (const node of graph.nodes) {
    const d = dirOf(node);
    fileCount[d] = (fileCount[d] || 0) + 1;
    if (!(d in externalIn)) externalIn[d] = 0;
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
    return {
      directory,
      'file-count': fc,
      'external-in-degree': inDeg,
      orphan: fc > 0 && inDeg === 0,
    };
  });

  return records;
}

export async function reportDirectories(
  graph: Graph,
  outPath: string,
  projectRoot: string,
  format?: 'json' | 'csv',
  onlyOrphans?: boolean
): Promise<string | undefined> {
  if (!format) return undefined;

  let records = computeDirectoryRecords(graph, projectRoot);
  if (onlyOrphans) {
    records = records.filter(r => r.orphan);
  }

  if (format === 'json') {
    const jsonString = JSON.stringify(records, null, 2);
    const jsonPath = `${outPath}.json`;
    await fs.writeFile(jsonPath, jsonString);
    return jsonPath;
  }

  if (format === 'csv') {
    const csvPath = `${outPath}.csv`;
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'directory', title: 'directory' },
        { id: 'file-count', title: 'file-count' },
        { id: 'external-in-degree', title: 'external-in-degree' },
        { id: 'orphan', title: 'orphan' },
      ],
    });
    await csvWriter.writeRecords(records);
    return csvPath;
  }

  return undefined;
}

