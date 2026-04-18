import { Graph, EdgeType } from '../../src/grapher';

describe('Graph edge types', () => {
  it('stores and retrieves edge types', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addNode('c');
    g.addEdge('a', 'b', 'static-import');
    g.addEdge('a', 'c', 'dynamic-import');

    expect(g.getEdgeType('a', 'b')).toBe('static-import');
    expect(g.getEdgeType('a', 'c')).toBe('dynamic-import');
  });

  it('defaults to static-import when no type specified', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addEdge('a', 'b');

    expect(g.getEdgeType('a', 'b')).toBe('static-import');
  });

  it('returns static-import for non-existent edge', () => {
    const g = new Graph();
    expect(g.getEdgeType('x', 'y')).toBe('static-import');
  });

  it('deduplicates edges (second addEdge is ignored)', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addEdge('a', 'b', 'static-import');
    g.addEdge('a', 'b', 'glob'); // duplicate — should be ignored

    expect(g.edges.length).toBe(1);
    expect(g.getEdgeType('a', 'b')).toBe('static-import');
  });

  it('getEdges returns all edges with types', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addNode('c');
    g.addEdge('a', 'b', 'static-import');
    g.addEdge('b', 'c', 'glob');

    const edges = g.getEdges();
    expect(edges).toEqual([
      { from: 'a', to: 'b', type: 'static-import' },
      { from: 'b', to: 'c', type: 'glob' },
    ]);
  });

  it('getImporters returns direct importers with types', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addNode('c');
    g.addEdge('a', 'c', 'static-import');
    g.addEdge('b', 'c', 'dynamic-import');

    const importers = g.getImporters('c');
    expect(importers).toEqual([
      { file: 'a', type: 'static-import' },
      { file: 'b', type: 'dynamic-import' },
    ]);
  });

  it('getImporters returns empty array for file with no importers', () => {
    const g = new Graph();
    g.addNode('a');
    expect(g.getImporters('a')).toEqual([]);
  });

  it('forwardAdjacency builds correct map', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addNode('c');
    g.addEdge('a', 'b', 'static-import');
    g.addEdge('a', 'c', 'glob');

    const fwd = g.forwardAdjacency();
    expect(fwd.get('a')).toEqual([
      { target: 'b', type: 'static-import' },
      { target: 'c', type: 'glob' },
    ]);
    expect(fwd.has('b')).toBe(false);
  });

  it('reverseAdjacency builds correct map', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addNode('c');
    g.addEdge('a', 'b', 'static-import');
    g.addEdge('c', 'b', 'dynamic-import');

    const rev = g.reverseAdjacency();
    expect(rev.get('b')).toEqual([
      { source: 'a', type: 'static-import' },
      { source: 'c', type: 'dynamic-import' },
    ]);
    expect(rev.has('a')).toBe(false);
  });

  it('supports all edge type values', () => {
    const types: EdgeType[] = [
      'static-import',
      'dynamic-import',
      'glob',
      'path-ref',
      'implicit',
      'cross-file-glob',
    ];
    const g = new Graph();
    for (let i = 0; i < types.length; i++) {
      g.addNode(`from${i}`);
      g.addNode(`to${i}`);
      g.addEdge(`from${i}`, `to${i}`, types[i]);
    }
    for (let i = 0; i < types.length; i++) {
      expect(g.getEdgeType(`from${i}`, `to${i}`)).toBe(types[i]);
    }
  });

  it('toJSON still works (backward compat)', () => {
    const g = new Graph();
    g.addNode('a');
    g.addNode('b');
    g.addEdge('a', 'b', 'glob');

    const json = g.toJSON();
    expect(json.nodes).toEqual(['a', 'b']);
    expect(json.edges).toEqual([['a', 'b']]);
  });
});
