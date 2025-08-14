import { state, resetState, setReport, setTab, setOnlyOrphans, setExtensions, setSortFiles, setSortDirs, setSearch } from './state.js';
import { parseReportText, filenameOf } from './parse.js';
import { buildTree, renderTree } from './tree.js';
import { renderFileControls, renderFileTable, renderDirControls, renderDirTable } from './table.js';

const el = s => /** @type {HTMLElement} */(document.querySelector(s));
const fileInput = el('#fileInput');
const reportName = el('#reportName');
const changeBtn = el('#changeReport');
const appHeader = el('#appHeader');
const tabTree = el('#tabTree');
const tabPrune = el('#tabPrune');
const treeContainer = el('#treeContainer');
const pruneControls = el('#pruneControls');
const pruneTbody = document.querySelector('#pruneTable tbody');
const onlyOrphans = el('#onlyOrphans');
const searchInput = el('#searchInput');
const clearSearch = el('#clearSearch');

function showLanding(){ document.body.setAttribute('data-view','landing'); appHeader.style.display='none'; document.getElementById('app').style.display='none'; document.getElementById('landing').style.display='grid'; }
function showApp(){ document.body.setAttribute('data-view','app'); appHeader.style.display='flex'; document.getElementById('app').style.display='block'; document.getElementById('landing').style.display='none'; }

function showLoading(show) {
  const loadingEl = document.getElementById('loading') || (() => {
    const el = document.createElement('div');
    el.id = 'loading';
    el.className = 'loading';
    el.innerHTML = '<div class="spinner"></div><div>Loading report...</div>';
    document.body.appendChild(el);
    return el;
  })();
  loadingEl.style.display = show ? 'flex' : 'none';
  // Disable tabs and controls while loading
  tabTree.disabled = tabPrune.disabled = show;
  const controls = document.querySelectorAll('button, input, select');
  controls.forEach(el => el.disabled = show);
}

async function onPickFile(file){
  showLoading(true);
  try {
    const text = await file.text();
    let parsed;
    try {
      parsed = parseReportText(text);
    } catch(e) {
      alert(e.message);
      return;
    }
    setReport({ filename: filenameOf(file) }, parsed.rows, parsed.type);
    reportName.textContent = filenameOf(file);
    changeBtn.style.display = '';
    setTab('tree');
    rerender();
    showApp();
  } finally {
    showLoading(false);
  }
}

function rerender(){
  // tabs
  tabTree.classList.toggle('active', state.tab==='tree');
  tabPrune.classList.toggle('active', state.tab==='prune');
  document.getElementById('treePane').style.display = state.tab==='tree' ? '' : 'none';
  document.getElementById('prunePane').style.display = state.tab==='prune' ? '' : 'none';

  if (state.tab==='tree'){
    const tree = buildTree(state.dataset);
    renderTree(treeContainer, tree);
  } else {
    if (state.reportType==='file'){
      renderFileControls(pruneControls, state.dataset, ({extensions, sort})=>{
        if (extensions) setExtensions(extensions);
        if (sort) setSortFiles(sort);
        rerender();
      });
      renderFileTable(pruneTbody, state.dataset, state.filters, state.sortFiles);
    } else {
      renderDirControls(pruneControls, state.dataset, ({sort, segment})=>{
        setSortDirs(sort, segment);
        rerender();
      });
      renderDirTable(pruneTbody, state.dataset, state.sortDirs, state.segment);
    }
  }
}

// wire events
fileInput.addEventListener('change', (e) => {
  const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
  if (f) onPickFile(f);
});
changeBtn.addEventListener('click', () => { resetState(); reportName.textContent=''; changeBtn.style.display='none'; showLanding(); });
function switchTab(tab) {
  setTab(tab);
  const isTree = tab === 'tree';
  tabTree.setAttribute('aria-selected', isTree.toString());
  tabPrune.setAttribute('aria-selected', (!isTree).toString());
  document.getElementById('treePane').style.display = isTree ? '' : 'none';
  document.getElementById('prunePane').style.display = isTree ? 'none' : '';
  rerender();
}

tabTree.addEventListener('click', () => switchTab('tree'));
tabPrune.addEventListener('click', () => switchTab('prune'));

// Keyboard navigation for tabs
[tabTree, tabPrune].forEach(tab => {
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      switchTab(state.tab === 'tree' ? 'prune' : 'tree');
    }
  });
});
onlyOrphans?.addEventListener('change',(e)=>{ setOnlyOrphans(/** @type {HTMLInputElement} */(e.target).checked); rerender(); });

// search functionality
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    setSearch(/** @type {HTMLInputElement} */(e.target).value);
    rerender();
  }, 200); // debounce search
});
clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  setSearch('');
  rerender();
});

// initial view
showLanding();


