import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from '../../src/parser';
import { withTempDir } from '../helpers/withTempDir';

describe('parser misc', () => {
  it('returns empty for non-script files with symbols', async () => withTempDir('parser-', async (root) => {
    const file = path.join(root, 'data.json');
    fs.writeFileSync(file, '{"a":1}');
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.imports).toEqual([]);
    expect(parsed.dynamicImports).toEqual([]);
    expect(parsed.importSpecs).toEqual([]);
    expect(parsed.exportsInfo).toEqual({ hasDefault: false, named: [], reExports: [] });
  }));

  it('captures default local name for class/function export', async () => withTempDir('parser-', async (root) => {
    const file = path.join(root, 'd.ts');
    fs.writeFileSync(file, 'export default class D {}; D;');
    const parsed = await parseFile(file, { collectSymbols: true });
    expect(parsed.exportUsage?.default?.exists).toBe(true);
    expect(parsed.exportUsage?.default?.localName).toBe('D');
    expect(parsed.exportUsage?.default?.referencedInFile).toBe(true);
  }));
});


