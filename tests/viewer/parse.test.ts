/**
 * @jest-environment jsdom
 */

async function importEsm(path: string){
  // Use dynamic import via eval to keep Jest from trying to parse as CJS
  // eslint-disable-next-line no-new-func
  const importer = new Function('p', 'return import(p)');
  return importer(path);
}

describe('viewer parse.js', () => {
  test('infers directory report', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseReportText } = require('../../dist/viewer-cjs/parse.js');
    const rows = [{ directory: 'src', orphan: true }];
    const out = parseReportText(JSON.stringify(rows));
    expect(out.type).toBe('directory');
    expect(Array.isArray(out.rows)).toBe(true);
  });

  test('infers file report', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseReportText } = require('../../dist/viewer-cjs/parse.js');
    const rows = [{ node: 'src/index.ts', orphan: true }];
    const out = parseReportText(JSON.stringify(rows));
    expect(out.type).toBe('file');
  });

  test('invalid mixed/no key yields friendly error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseReportText } = require('../../dist/viewer-cjs/parse.js');
    expect(() => parseReportText(JSON.stringify([{ foo: 'bar' }]))).toThrow(
      /Interpreting the report/i
    );
  });
});


