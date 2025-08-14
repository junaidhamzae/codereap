import { state, resetState, setReport, setTab, setOnlyOrphans, setExtensions } from './state.js';
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

async function onPickFile(file){
  const text = await file.text();
  let parsed; try { parsed = parseReportText(text); } catch(e){ alert(e.message); return; }
  setReport({ filename: filenameOf(file) }, parsed.rows, parsed.type);
  reportName.textContent = filenameOf(file);
  changeBtn.style.display = '';
  setTab('tree');
  rerender();
  showApp();
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
        rerender();
      });
      renderFileTable(pruneTbody, state.dataset, state.filters, 'sizeFirst');
    } else {
      renderDirControls(pruneControls, state.dataset, ({sort, segment})=>{ rerender(); });
      renderDirTable(pruneTbody, state.dataset, 'sizeDesc');
    }
  }
}

// wire events
fileInput.addEventListener('change', (e) => {
  const f = /** @type {HTMLInputElement} */ (e.target).files?.[0];
  if (f) onPickFile(f);
});
changeBtn.addEventListener('click', () => { resetState(); reportName.textContent=''; changeBtn.style.display='none'; showLanding(); });
tabTree.addEventListener('click',()=>{ setTab('tree'); rerender(); });
tabPrune.addEventListener('click',()=>{ setTab('prune'); rerender(); });
onlyOrphans?.addEventListener('change',(e)=>{ setOnlyOrphans(/** @type {HTMLInputElement} */(e.target).checked); rerender(); });

// initial view
showLanding();


