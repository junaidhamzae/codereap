/**
 * @jest-environment jsdom
 */

describe('viewer parse.js', () => {
  test('infers directory report', async () => {
    const { parseReportText } = await import('../../dist/viewer/parse.js');
		const rows = [{ directory: 'src', orphan: true }];
		const out = parseReportText(JSON.stringify(rows));
		expect(out.type).toBe('directory');
		expect(Array.isArray(out.rows)).toBe(true);
	});

  test('infers file report', async () => {
    const { parseReportText } = await import('../../dist/viewer/parse.js');
		const rows = [{ node: 'src/index.ts', orphan: true }];
		const out = parseReportText(JSON.stringify(rows));
		expect(out.type).toBe('file');
	});

  test('invalid mixed/no key yields friendly error', async () => {
    const { parseReportText } = await import('../../dist/viewer/parse.js');
		expect(() => parseReportText(JSON.stringify([{ foo: 'bar' }]))).toThrow(
			/Interpreting the report/i
		);
	});
});


