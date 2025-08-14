const README_ANCHOR = 'See README → Interpreting the report.';
export function parseReportText(text){
  let data; try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON. ' + README_ANCHOR); }
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : data?.data ?? data;
  if (!Array.isArray(rows) || rows.length===0) throw new Error('Empty or invalid report. ' + README_ANCHOR);
  const sample = rows.find(Boolean) || {};
  const isDir = Object.prototype.hasOwnProperty.call(sample,'directory');
  const isFile = Object.prototype.hasOwnProperty.call(sample,'node');
  if (isDir === isFile) throw new Error('Could not infer report type (directory vs file). ' + README_ANCHOR);
  return { rows, type: isDir ? 'directory' : 'file' };
}
export function filenameOf(file){ return file?.name || 'report.json'; }


