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

  test('unwraps metadata-wrapped file report (data.files)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseReportText } = require('../../dist/viewer-cjs/parse.js');
    const report = {
      version: '1.0.0',
      root: '/tmp/proj',
      'total-files': 1,
      'orphan-count': 1,
      'live-count': 0,
      files: [{ node: 'src/index.ts', orphan: true }],
    };
    const out = parseReportText(JSON.stringify(report));
    expect(out.type).toBe('file');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].node).toBe('src/index.ts');
  });

  test('unwraps metadata-wrapped directory report (data.directories)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseReportText } = require('../../dist/viewer-cjs/parse.js');
    const report = {
      version: '1.0.0',
      root: '/tmp/proj',
      'total-directories': 1,
      directories: [{ directory: 'src', orphan: true }],
    };
    const out = parseReportText(JSON.stringify(report));
    expect(out.type).toBe('directory');
    expect(out.rows).toHaveLength(1);
  });
});


