import fs from 'node:fs';
import path from 'node:path';
import { resolveImport } from '../../src/resolver';
import { withTempDir } from '../helpers/withTempDir';

describe('resolver exact extension', () => {
  it('returns candidatePath when specifier includes extension', () => withTempDir('resolver-', (root) => {
    const from = path.join(root, 'src', 'a.ts');
    const target = path.join(root, 'src', 'b.ts');
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.writeFileSync(from, '');
    fs.writeFileSync(target, '');
    const p = resolveImport(from, './b.ts', { root });
    expect(p).toBe(target);
  }));
});


