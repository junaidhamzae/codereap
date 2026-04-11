export class Graph {
  nodes: Set<string> = new Set();
  edges: [string, string][] = [];
  private edgeSet: Set<string> = new Set();

  addNode(path: string) {
    this.nodes.add(path);
  }

  addEdge(from: string, to: string) {
    const key = `${from}\0${to}`;
    if (this.edgeSet.has(key)) return;
    this.edgeSet.add(key);
    this.edges.push([from, to]);
  }

  toJSON(): { nodes: string[]; edges: [string, string][] } {
    return {
      nodes: Array.from(this.nodes),
      edges: this.edges,
    };
  }
}

