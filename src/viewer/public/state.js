// export state singleton
export const state = {
  dataset: /** @type {any[]|null} */ (null),
  reportType: /** @type {'directory'|'file'|null} */ (null),
  filters: { onlyOrphans: false, extensions: /** @type {string[]} */([]) },
  tab: /** @type {'tree'|'prune'} */ ('tree'),
  fileMeta: { filename: '' },
  sortFiles: /** @type {'sizeFirst'|'leafOrphanFirst'|'maxExportsOrphanFirst'} */ ('sizeFirst'),
  sortDirs: /** @type {'sizeDesc'|'fileCountDesc'|'quickWins'|'segment'} */ ('sizeDesc'),
  segment: '',
  search: '',
};
export function resetState() { state.dataset = null; state.reportType = null; state.filters.onlyOrphans = false; state.filters.extensions = []; state.tab = 'tree'; state.fileMeta.filename=''; state.sortFiles = 'sizeFirst'; state.sortDirs = 'sizeDesc'; state.segment = ''; state.search = ''; }
export function setReport(meta, rows, type) { state.fileMeta = meta; state.dataset = rows; state.reportType = type; }
export function setTab(tab) { state.tab = tab; }
export function setOnlyOrphans(v) { state.filters.onlyOrphans = v; }
export function setExtensions(list) { state.filters.extensions = list; }
export function setSortFiles(sort) { state.sortFiles = sort; }
export function setSortDirs(sort, segment='') { state.sortDirs = sort; state.segment = segment; }
export function setSearch(query) { state.search = query; }


