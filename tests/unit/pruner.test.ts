import { Graph } from '../../src/grapher';
import { computeLiveFiles, findOrphans } from '../../src/pruner';

function makeGraph(edges: [string, string][], nodes: string[]) {
  const g = new Graph();
  nodes.forEach((n) => g.addNode(n));
  edges.forEach(([f, t]) => g.addEdge(f, t));
  return g;
}

describe('pruner.computeLiveFiles', () => {
  it('handles simple chain and cycles', () => {
    const A = '/proj/A.ts';
    const B = '/proj/B.ts';
    const C = '/proj/C.ts';
    const D = '/proj/D.ts';
    const E = '/proj/E.ts';

    const graph = makeGraph(
      [
        [A, B],
        [B, C],
        [C, A], // cycle A->B->C->A
        [C, D],
      ],
      [A, B, C, D, E],
    );

    const liveFromA = computeLiveFiles(graph, [A]);
    expect(liveFromA).toEqual(new Set([A, B, C, D]));
  });

  it('handles multiple entrypoints with overlapping paths', () => {
    const A = '/proj/A.ts';
    const B = '/proj/B.ts';
    const C = '/proj/C.ts';
    const D = '/proj/D.ts';
    const E = '/proj/E.ts';

    const graph = makeGraph(
      [
        [A, B],
        [B, C],
        [D, C],
      ],
      [A, B, C, D, E],
    );

    const live = computeLiveFiles(graph, [A, D]);
    expect(live).toEqual(new Set([A, B, C, D]));
  });
});

describe('pruner.findOrphans', () => {
  it('returns nodes minus live set', () => {
    const A = '/p/A.ts';
    const B = '/p/B.ts';
    const C = '/p/C.ts';
    const D = '/p/D.ts';
    const graph = makeGraph(
      [
        [A, B],
      ],
      [A, B, C, D],
    );
    const orphans = findOrphans(graph, [A], []);
    expect(new Set(orphans)).toEqual(new Set([C, D]));
  });

  it('applies exclude patterns via micromatch.not', () => {
    const A = '/p/A.ts';
    const B = '/p/B.ts';
    const C = '/p/C.ts';
    const D = '/p/D.test.ts';
    const graph = makeGraph([], [A, B, C, D]);
    const orphans = findOrphans(graph, [], ['**/*.test.ts']);
    expect(new Set(orphans)).toEqual(new Set([A, B, C]));
  });
});


