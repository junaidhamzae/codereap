export class Graph {
  nodes: Set<string> = new Set();
  edges: [string, string][] = [];

  addNode(path: string) {
    this.nodes.add(path);
  }

  addEdge(from: string, to: string) {
    this.edges.push([from, to]);
  }

  toJSON(): { nodes: string[]; edges: [string, string][] } {
    return {
      nodes: Array.from(this.nodes),
      edges: this.edges,
    };
  }
}

