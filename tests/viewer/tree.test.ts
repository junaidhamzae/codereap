/**
 * @jest-environment jsdom
 */

async function importEsm(path: string){
  // eslint-disable-next-line no-new-func
  const importer = new Function('p', 'return import(p)');
  return importer(path);
}

describe('viewer tree Only orphans filter', () => {
  test('hides non-orphan leaves when onlyOrphans = true', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const stateMod = require('../../dist/viewer-cjs/state.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const treeMod = require('../../dist/viewer-cjs/tree.js');
    const { state } = stateMod as any;
    const { buildTree, renderTree } = treeMod as any;

    state.reportType = 'file';
    const rows = [
      { node: 'a/A.ts', orphan: true },
      { node: 'a/B.ts', orphan: false },
    ];
    const tree = buildTree(rows);
    const container = document.createElement('div');

    // only orphans
    state.filters.onlyOrphans = true;
    renderTree(container, tree);
    expect(container.textContent).toContain('a');
    expect(container.textContent).toContain('A.ts');
    expect(container.textContent).not.toContain('B.ts');

    // all
    state.filters.onlyOrphans = false;
    renderTree(container, tree);
    expect(container.textContent).toContain('B.ts');
  });
});


