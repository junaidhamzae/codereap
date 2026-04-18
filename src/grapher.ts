export type EdgeType =
  | 'static-import'
  | 'dynamic-import'
  | 'glob'
  | 'path-ref'
  | 'implicit'
  | 'cross-file-glob';

export interface EdgeInfo {
  from: string;
  to: string;
  type: EdgeType;
}

export class Graph {
  nodes: Set<string> = new Set();
  edges: [string, string][] = [];
  private edgeSet: Set<string> = new Set();
  private edgeTypeMap: Map<string, EdgeType> = new Map();

  addNode(path: string) {
    this.nodes.add(path);
  }

  addEdge(from: string, to: string, type: EdgeType = 'static-import') {
    const key = `${from}\0${to}`;
    if (this.edgeSet.has(key)) return;
    this.edgeSet.add(key);
    this.edges.push([from, to]);
    this.edgeTypeMap.set(key, type);
  }

  getEdgeType(from: string, to: string): EdgeType {
    const key = `${from}\0${to}`;
    return this.edgeTypeMap.get(key) || 'static-import';
  }

  /** Build a forward adjacency list: file → [{target, type}] */
  forwardAdjacency(): Map<string, Array<{ target: string; type: EdgeType }>> {
    const adj = new Map<string, Array<{ target: string; type: EdgeType }>>();
    for (const [from, to] of this.edges) {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push({ target: to, type: this.getEdgeType(from, to) });
    }
    return adj;
  }

  /** Build a reverse adjacency list: file → [{source, type}] */
  reverseAdjacency(): Map<string, Array<{ source: string; type: EdgeType }>> {
    const rev = new Map<string, Array<{ source: string; type: EdgeType }>>();
    for (const [from, to] of this.edges) {
      if (!rev.has(to)) rev.set(to, []);
      rev.get(to)!.push({ source: from, type: this.getEdgeType(from, to) });
    }
    return rev;
  }

  /** Get all edges with type info */
  getEdges(): EdgeInfo[] {
    return this.edges.map(([from, to]) => ({
      from,
      to,
      type: this.getEdgeType(from, to),
    }));
  }

  /** Get direct importers of a file */
  getImporters(file: string): Array<{ file: string; type: EdgeType }> {
    const importers: Array<{ file: string; type: EdgeType }> = [];
    for (const [from, to] of this.edges) {
      if (to === file) {
        importers.push({ file: from, type: this.getEdgeType(from, to) });
      }
    }
    return importers;
  }

  toJSON(): { nodes: string[]; edges: [string, string][] } {
    return {
      nodes: Array.from(this.nodes),
      edges: this.edges,
    };
  }
}
