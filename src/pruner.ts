import { Graph } from './grapher';
import micromatch from 'micromatch';

export function computeLiveFiles(graph: Graph, entrypoints: string[]): Set<string> {
  const adjacencyList = new Map<string, string[]>();
  for (const [from, to] of graph.edges) {
    if (!adjacencyList.has(from)) adjacencyList.set(from, []);
    adjacencyList.get(from)!.push(to);
  }

  const liveFiles = new Set<string>();
  const queue: string[] = [];

  // Seed with entrypoints that are present in the graph
  for (const ep of entrypoints) {
    if (graph.nodes.has(ep)) queue.push(ep);
  }

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (liveFiles.has(current)) continue;
    liveFiles.add(current);

    const neighbors = adjacencyList.get(current) || [];
    for (const next of neighbors) {
      if (!liveFiles.has(next)) queue.push(next);
    }
  }

  return liveFiles;
}

export function findOrphans(
  graph: Graph,
  entrypoints: string[],
  excludePatterns: string[]
): string[] {
  const liveFiles = computeLiveFiles(graph, entrypoints);
  const orphans = [...graph.nodes].filter((file) => !liveFiles.has(file));

  if (excludePatterns && excludePatterns.length > 0) {
    return micromatch.not(orphans, excludePatterns);
  }

  return orphans;
}
