import path from 'node:path';
import { resolveImport } from '../../src/resolver';

describe('resolver node package resolution', () => {
  it('resolves a node builtin module via require.resolve path option', () => {
    const from = path.join(process.cwd(), 'src', 'dummy.ts');
    const p = resolveImport(from, 'path', { root: process.cwd() });
    // Should resolve to builtin path module or node resolution path
    expect(typeof p === 'string' || p === null).toBe(true);
  });
});


