import { state, resetState, setReport, setTab, setOnlyOrphans, setExtensions, setSortFiles, setSortDirs, setSearch } from './state.js';
import { showToast } from './utils.js';
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

    // Show loading for large reports
    const isLargeReport = parsed.rows.length > 1000;
    if (isLargeReport) {
      showToast('Processing large report...');
    }

    // Use requestIdleCallback or setTimeout to defer heavy processing
    const process = () => new Promise(resolve => {
      const fn = window.requestIdleCallback || (cb => setTimeout(cb, 0));
      fn(() => {
        setReport({ filename: filenameOf(file) }, parsed.rows, parsed.type);
        reportName.textContent = filenameOf(file);
        changeBtn.style.display = '';
        setTab('tree');
        onlyOrphans.disabled = false;
        onlyOrphans.checked = false;
        setOnlyOrphans(false);
        rerender();
        showApp();
        resolve();
      });
    });

    await process();
  } finally {
    showLoading(false);
  }
}

let renderTimeout;
function rerender(){
  // Clear any pending render
  clearTimeout(renderTimeout);

  // Update tabs immediately
  tabTree.classList.toggle('active', state.tab==='tree');
  tabPrune.classList.toggle('active', state.tab==='prune');
  document.getElementById('treePane').style.display = state.tab==='tree' ? '' : 'none';
  document.getElementById('prunePane').style.display = state.tab==='prune' ? '' : 'none';

  // Debounce heavy rendering
  renderTimeout = setTimeout(() => {
    if (state.tab==='tree'){
      const tree = buildTree(state.dataset);
      renderTree(treeContainer, tree);
    } else {
      if (state.reportType==='file'){
              // Preserve current sort and extension filters
      const currentSort = state.sortFiles;
      const currentExts = [...state.filters.extensions];

      renderFileControls(pruneControls, state.dataset, ({extensions, sort})=>{
        if (extensions) setExtensions(extensions);
        if (sort) setSortFiles(sort);
        rerender();
      });

      // Restore sort and extension selections
      const sortSelect = pruneControls.querySelector('select');
      if (sortSelect) sortSelect.value = currentSort;

      const extChecks = pruneControls.querySelectorAll('input[type="checkbox"]');
      extChecks.forEach(cb => {
        const ext = cb.id.replace('ext-', '');
        cb.checked = currentExts.includes(ext);
      });

      renderFileTable(pruneTbody, state.dataset, state.filters, state.sortFiles);
      } else {
        // Preserve current sort and segment selections
        const currentSort = state.sortDirs;
        const currentSegment = state.segment;

        renderDirControls(pruneControls, state.dataset, ({sort, segment})=>{
          setSortDirs(sort, segment);
          rerender();
        });

        // Restore sort and segment selections
        const sortSelect = pruneControls.querySelector('select');
        if (sortSelect) sortSelect.value = currentSort;

        const segmentSelect = pruneControls.querySelector('select:nth-child(2)');
        if (segmentSelect && currentSort === 'segment') {
          segmentSelect.style.display = '';
          segmentSelect.value = currentSegment;
        }

        renderDirTable(pruneTbody, state.dataset, state.sortDirs, state.segment);
      }
    }
  }, 100); // Small delay to batch rapid updates
}

// wire events
fileInput.addEventListener('change', (e) => {
  const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
  if (f) onPickFile(f);
});

// Reset state and UI when changing report
changeBtn.addEventListener('click', () => {
  // Clear all state
  resetState();
  // Reset UI elements
  reportName.textContent = '';
  changeBtn.style.display = 'none';
  onlyOrphans.checked = false;
  // Return to landing
  showLanding();
});
function switchTab(tab) {
  setTab(tab);
  const isTree = tab === 'tree';
  tabTree.setAttribute('aria-selected', isTree.toString());
  tabPrune.setAttribute('aria-selected', (!isTree).toString());
  document.getElementById('treePane').style.display = isTree ? '' : 'none';
  document.getElementById('prunePane').style.display = isTree ? 'none' : '';
  
  // Handle Only Orphans checkbox state
  if (isTree) {
    onlyOrphans.disabled = false;
  } else {
    onlyOrphans.checked = true;
    onlyOrphans.disabled = true;
    setOnlyOrphans(true);
  }
  
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
// Make the entire Only Orphans wrapper clickable
const onlyOrphansWrapper = onlyOrphans?.closest('.checkbox-wrapper');
if (onlyOrphansWrapper) {
  // Handle direct checkbox changes
  onlyOrphans.addEventListener('change', (e) => {
    setOnlyOrphans(/** @type {HTMLInputElement} */(e.target).checked);
    rerender();
  });

  // Handle wrapper clicks
  onlyOrphansWrapper.addEventListener('click', (e) => {
    // Don't handle click if it's directly on the checkbox or label (let the native behavior work)
    if (e.target === onlyOrphans || e.target.tagName === 'LABEL') return;
    
    // Toggle checkbox and trigger change event
    onlyOrphans.click();
  });
}



// initial view
showLanding();


