import path from 'path';

type ImportRecord = {
  source: string;
  resolved?: string;
};

type Symbols = {
  imports?: ImportRecord[];
};

type FileRow = {
  node: string;
  symbols?: Symbols;
};

export function normalizeReport<T extends { node: string; symbols?: Symbols }>(
  rows: T[],
): T[] {
  const sorted = [...rows].sort((a, b) => a.node.localeCompare(b.node));
  for (const row of sorted) {
    if (row.symbols?.imports) {
      row.symbols.imports.sort((a, b) => {
        const aKey = `${a.source}|${a.resolved ?? ''}`;
        const bKey = `${b.source}|${b.resolved ?? ''}`;
        return aKey.localeCompare(bKey);
      });
    }
    // normalise to posix for assertions
    row.node = row.node.split(path.sep).join(path.posix.sep);
  }
  return sorted;
}


