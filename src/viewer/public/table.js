import { state } from './state.js';
import { humanBytes, extOf, copyText, firstSegment, highlightMatches } from './utils.js';

// Sorting strategies
export const fileSorts = {
  sizeFirst: (a,b)=> (b['size-bytes']??0) - (a['size-bytes']??0),
  leafOrphanFirst: (a,b)=> (a['in-degree']??0) - (b['in-degree']??0) || (b['size-bytes']??0) - (a['size-bytes']??0),
  maxExportsOrphanFirst: (a,b)=>{
    const [ae,at] = exportCounts(a); const [be,bt] = exportCounts(b);
    const ar = at>0 ? ae/at : -1; const br = bt>0 ? be/bt : -1;
    return (br - ar) || (b['size-bytes']??0) - (a['size-bytes']??0);
  }
};

function exportCounts(r){
  const ex = r?.symbols?.exports;
  if (!ex) return [0,0];
  const named = Array.isArray(ex.named) ? ex.named : [];
  const orphanNamed = named.filter(e=>e.orphan).length;
  const total = (ex.default ? 1 : 0) + named.length;
  const orphanTotal = (ex.default?.orphan ? 1 : 0) + orphanNamed;
  return [orphanTotal, total];
}

export function renderFileControls(ctrlEl, rows, onChange){
  // dynamic extension checkboxes
  const exts = Array.from(new Set(rows.map(r=>extOf(r.node)).filter(Boolean))).sort();
  ctrlEl.textContent=''; const wrap = document.createElement('div'); wrap.className='controls';
  
  // Strategy dropdown
  const strategyWrap = document.createElement('div'); strategyWrap.className='strategy';
  const strategyLabel = document.createElement('label'); strategyLabel.textContent='Strategy:';
  const sortSel=document.createElement('select');
  sortSel.innerHTML = `
    <option value="sizeFirst" title="Sort by file size (largest first) to identify high-impact files">By size (descending)</option>
    <option value="leafOrphanFirst" title="Sort by in-degree (0 first) then size to find unused leaf files">By leaf orphan count</option>
    <option value="maxExportsOrphanFirst" title="Sort by ratio of orphaned exports to total exports to find partially used modules">By export orphan ratio</option>
  `;
  sortSel.value = state.sortFiles;
  sortSel.onchange=()=>onChange({sort:sortSel.value});
  strategyWrap.append(strategyLabel, sortSel);

  // Extensions checkboxes
  const extWrap = document.createElement('div'); extWrap.className='exts';
  const extLabel = document.createElement('label'); extLabel.textContent='Extensions:';
  const extBoxes = document.createElement('div'); extBoxes.className='ext-boxes';
  exts.forEach(x=>{
    const id=`ext-${x}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-wrapper';
    
    const cb=document.createElement('input');
    cb.type='checkbox';
    cb.id=id;
    cb.checked=state.filters.extensions.includes(x);
    
    const lab=document.createElement('label');
    lab.htmlFor=id;
    lab.textContent=x;
    
    wrapper.append(cb,lab);
    
    // Make the entire wrapper clickable
    wrapper.onclick = (e) => {
      // Don't handle click if it's directly on the checkbox (let the native behavior work)
      if (e.target === cb) return;
      
      // Toggle checkbox
      cb.checked = !cb.checked;
      
      // Trigger change event
      const selected = Array.from(extBoxes.querySelectorAll('input:checked')).map(i=>i.id.replace('ext-',''));
      onChange({extensions:selected});
    };
    
    extBoxes.append(wrapper);
  });
  extWrap.append(extLabel, extBoxes);

  // Copy paths button
  const copyBtn=document.createElement('button'); copyBtn.textContent='Copy paths'; copyBtn.onclick=()=>copyVisible();
  copyBtn.className = 'copy-paths-btn';

  wrap.append(strategyWrap, extWrap, copyBtn); ctrlEl.append(wrap);

  function copyVisible(){
    const paths = Array.from(document.querySelectorAll('tbody tr')).map(tr=>tr.getAttribute('data-path')).filter(Boolean);
    copyText(paths.join(','));
  }
}

export function renderFileTable(tbodyEl, rows, filters, sortKey){
  // Update table headers for file report
  const thead = tbodyEl.parentElement.querySelector('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col">Path</th>
      <th scope="col">Size</th>
      <th scope="col">In-degree</th>
      <th scope="col">Exports (Orphan/Total)</th>
    </tr>
  `;
  let cur = rows;
  if (filters.onlyOrphans) {
    cur = cur.filter(r => r.orphan === true);
  }
  if (filters.extensions?.length){ cur = cur.filter(r => filters.extensions.includes(extOf(r.node))); }
  if (state.search){ cur = cur.filter(r => r.node.toLowerCase().includes(state.search.toLowerCase())); }
  const sorter = fileSorts[sortKey || 'sizeFirst']; cur = cur.sort(sorter);
  tbodyEl.textContent='';
  if (cur.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty-state';
    td.textContent = state.search
      ? 'No files match your search'
      : state.filters.onlyOrphans
        ? 'No orphaned files found'
        : 'No files found';
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
    return;
  }
  for(const r of cur){
    const tr=document.createElement('tr'); tr.setAttribute('data-path', r.node);
    const ex = r.symbols?.exports;
    const total = ex ? ((ex.default?1:0) + (ex.named?.length||0)) : 0;
    const orphanTotal = ex ? ((ex.default?.orphan?1:0) + (ex.named?.filter(n=>n.orphan).length||0)) : 0;
    tr.innerHTML = `<td>${highlightMatches(r.node, state.search)}</td><td>${humanBytes(r['size-bytes'])}</td><td>${r['in-degree']??'–'}</td><td>${ex? `${orphanTotal}/${total}` : '–'}</td>`;
    // Add orphan class when unchecked and row is orphan
    if (r.orphan && !state.filters.onlyOrphans) tr.classList.add('orphan');
    tr.onclick = ()=>toggleExpand(tr, r);
    tr.setAttribute('aria-expanded', 'false');
    tr.style.cursor = 'pointer';
    tbodyEl.appendChild(tr);
  }
}

export function renderDirControls(ctrlEl, rows, onChange){
  ctrlEl.textContent='';
  const sortSel=document.createElement('select');
  sortSel.innerHTML = `
    <option value="sizeDesc" title="Sort by total size (largest first) to identify high-impact directories">By total size (descending)</option>
    <option value="fileCountDesc" title="Sort by number of files (most first) to find dense directories">By file count (descending)</option>
    <option value="quickWins" title="Sort by total size (smallest first) to find easy cleanup targets">Quick wins (small first)</option>
    <option value="segment" title="Group by top-level directory and sort by size to organize cleanup">By directory segment</option>
  `;
  sortSel.value = state.sortDirs;
  const segmentSel=document.createElement('select'); segmentSel.style.display = state.sortDirs==='segment' ? '' : 'none';
  sortSel.onchange=()=>{
    segmentSel.style.display = sortSel.value==='segment' ? '' : 'none';
    if (sortSel.value==='segment'){
      const segs = Array.from(new Set(rows.map(r=>firstSegment(r.directory)))).sort();
      segmentSel.innerHTML = '<option value="">(Select segment)</option>' + segs.map(s=>`<option value="${s}"${s===state.segment?' selected':''}>${s}</option>`).join('');
    }
    onChange({sort:sortSel.value, segment: segmentSel.value});
  };
  segmentSel.onchange=()=>onChange({sort:'segment', segment: segmentSel.value});
  const copyBtn=document.createElement('button'); copyBtn.textContent='Copy paths'; copyBtn.onclick=()=>copyVisible();
  ctrlEl.append(sortSel, segmentSel, copyBtn);

  function copyVisible(){
    const paths = Array.from(document.querySelectorAll('tbody tr')).map(tr=>tr.getAttribute('data-path')).filter(Boolean);
    copyText(paths.join(','));
  }
}

function toggleExpand(tr, record) {
  const existingDetail = tr.nextElementSibling;
  const isExpanded = tr.getAttribute('aria-expanded') === 'true';

  // Remove existing detail row if collapsing
  if (isExpanded && existingDetail?.classList.contains('detail-row')) {
    existingDetail.remove();
    tr.setAttribute('aria-expanded', 'false');
    return;
  }

  // Create detail row
  const detailRow = document.createElement('tr');
  detailRow.className = 'detail-row';
  const detailCell = document.createElement('td');
  detailCell.colSpan = 4;

  // Build exports section
  const ex = record.symbols?.exports;
  if (ex) {
    const exportsDiv = document.createElement('div');
    exportsDiv.className = 'exports-section';
    exportsDiv.innerHTML = '<h4>Exports</h4>';

    if (ex.default) {
      const defaultDiv = document.createElement('div');
      defaultDiv.className = `export-item${ex.default.orphan ? ' orphan' : ''}`;
      defaultDiv.textContent = 'default';
      exportsDiv.appendChild(defaultDiv);
    }

    if (ex.named?.length) {
      const namedList = document.createElement('div');
      namedList.className = 'export-list';
      ex.named.forEach(n => {
        const item = document.createElement('div');
        item.className = `export-item${n.orphan ? ' orphan' : ''}`;
        item.textContent = n.name;
        namedList.appendChild(item);
      });
      exportsDiv.appendChild(namedList);
    }

    detailCell.appendChild(exportsDiv);
  }

  // Build imports section
  const imports = record.imports?.filter(i => i.resolved);
  if (imports?.length) {
    const importsDiv = document.createElement('div');
    importsDiv.className = 'imports-section';
    importsDiv.innerHTML = '<h4>Imports</h4>';

    const importsList = document.createElement('div');
    importsList.className = 'import-list';
    imports.forEach(i => {
      const item = document.createElement('div');
      item.className = 'import-item';
      const path = i.resolved;
      item.innerHTML = `<span>${path}</span><button class="copy-btn" title="Copy path" onclick="event.stopPropagation(); navigator.clipboard.writeText('${path}')"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>`;
      importsList.appendChild(item);
    });
    importsDiv.appendChild(importsList);
    detailCell.appendChild(importsDiv);
  }

  detailRow.appendChild(detailCell);
  tr.after(detailRow);
  tr.setAttribute('aria-expanded', 'true');
}

export function renderDirTable(tbodyEl, rows, sortKey, segment){
  // Update table headers for directory report
  const thead = tbodyEl.parentElement.querySelector('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col">Directory</th>
      <th scope="col">File Count</th>
      <th scope="col">Total Size</th>
      <th scope="col">Actions</th>
    </tr>
  `;
  let cur = rows;
  if (state.filters.onlyOrphans) {
    cur = cur.filter(r => r.orphan === true);
  }
  if (state.search){ cur = cur.filter(r => r.directory.toLowerCase().includes(state.search.toLowerCase())); }
  const key = sortKey || 'sizeDesc';
  if (key==='segment' && segment){ cur = cur.filter(r => firstSegment(r.directory) === segment); }
  const sorters = {
    sizeDesc: (a,b)=> (b['size-bytes']??0) - (a['size-bytes']??0),
    fileCountDesc: (a,b)=> (b['file-count']??0) - (a['file-count']??0),
    quickWins: (a,b)=> (a['size-bytes']??0) - (b['size-bytes']??0),
    segment: (a,b)=> (b['size-bytes']??0) - (a['size-bytes']??0),
  };
  cur = cur.sort(sorters[key]);
  tbodyEl.textContent='';
  if (cur.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty-state';
    td.textContent = state.search
      ? 'No directories match your search'
      : state.filters.onlyOrphans
        ? 'No orphaned directories found'
        : 'No directories found';
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
    return;
  }
  for(const r of cur){
    const tr=document.createElement('tr'); tr.setAttribute('data-path', r.directory);
    tr.innerHTML = `<td>${highlightMatches(r.directory, state.search)}</td><td>${r['file-count']??'–'}</td><td>${humanBytes(r['size-bytes'])}</td><td><button class="copy-btn" title="Copy path to clipboard"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button></td>`;
    // Add orphan class when unchecked and row is orphan
    if (r.orphan && !state.filters.onlyOrphans) tr.classList.add('orphan');
    tr.querySelector('.copy-btn').onclick = (e)=>{ e.stopPropagation(); copyText(r.directory); };
    tbodyEl.appendChild(tr);
  }
}


