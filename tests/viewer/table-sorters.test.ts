/**
 * @jest-environment jsdom
 */

describe('viewer table sorters', () => {
  test('file sorters behave as expected', async () => {
    const { fileSorts } = await import('../../dist/viewer/table.js');
    const rows = [
      { node:'a.ts', orphan:true, 'size-bytes': 100, 'in-degree': 2, symbols:{ exports:{ default:{ orphan:true }, named:[{name:'x', orphan:false}] } } },
      { node:'b.ts', orphan:true, 'size-bytes': 300, 'in-degree': 0, symbols:{ exports:{ named:[{name:'x', orphan:true},{name:'y', orphan:true}] } } },
      { node:'c.ts', orphan:true, 'size-bytes': 200, 'in-degree': 1 },
    ];
    const sizeFirst = [...rows].sort(fileSorts.sizeFirst);
    expect(sizeFirst[0].node).toBe('b.ts');
    const leafFirst = [...rows].sort(fileSorts.leafOrphanFirst);
    expect(leafFirst[0].node).toBe('b.ts');
    const maxExports = [...rows].sort(fileSorts.maxExportsOrphanFirst);
    expect(maxExports[0].node).toBe('b.ts');
  });

  test('directory sorters behave as expected', async () => {
    const mod = await import('../../dist/viewer/table.js');
    const { renderDirTable } = mod as any;
    const tbody = document.createElement('tbody');
    const rows = [
      { directory:'src/a', orphan:true, 'size-bytes': 300, 'file-count': 3 },
      { directory:'src/b', orphan:true, 'size-bytes': 100, 'file-count': 10 },
      { directory:'lib/c', orphan:true, 'size-bytes': 200, 'file-count': 1 },
    ];
    renderDirTable(tbody, rows, 'sizeDesc');
    expect((tbody.querySelector('tr') as HTMLTableRowElement).getAttribute('data-path')).toBe('src/a');
  });
});


