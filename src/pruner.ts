import { Graph } from './grapher';
import micromatch from 'micromatch';

export function findOrphans(graph: Graph, entrypoints: string[], excludePatterns: string[]): string[] {
  const livingFiles = new Set<string>();
  const queue = [...entrypoints];

  const adjList = new Map<string, string[]>();
  for (const [from, to] of graph.edges) {
    if (!adjList.has(from)) {
      adjList.set(from, []);
    }
    adjList.get(from)!.push(to);
  }

  while (queue.length > 0) {
    const currentFile = queue.shift()!;
    if (!currentFile || livingFiles.has(currentFile)) {
      continue;
    }
    livingFiles.add(currentFile);

    const dependencies = adjList.get(currentFile) || [];
    for (const dependency of dependencies) {
      queue.push(dependency);
    }
  }

  const allFiles = new Set(graph.nodes);
  const orphans = [...allFiles].filter(file => !livingFiles.has(file));

  if (excludePatterns && excludePatterns.length > 0) {
    return micromatch.not(orphans, excludePatterns);
  }

  return orphans;
}
