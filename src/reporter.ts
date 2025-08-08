import * as fs from 'fs/promises';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { Graph } from './grapher';

export async function reportGraph(
  graph: Graph,
  outPath: string,
  projectRoot: string,
  format?: 'json' | 'csv'
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
  const records: Array<{ [key: string]: string | number | boolean }> = nodes.map(nodeAbs => {
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

