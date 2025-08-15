import { state } from './state.js';
import { humanBytes, copyText, highlightMatches } from './utils.js';

function segs(p){ return p.split('/').filter(Boolean); }

export function buildTree(rows){
  const root = { name:'/', kind:'dir', children:new Map(), payload:null };
  const keyField = state.reportType === 'directory' ? 'directory' : 'node';
  for(const r of rows){
    const parts = segs(r[keyField]);
    let cur = root;
    for(let i=0;i<parts.length;i++){
      const name = parts[i];
      const isLeaf = i===parts.length-1;
      if (!cur.children.has(name)) cur.children.set(name, { name, kind: isLeaf && state.reportType==='file' ? 'file':'dir', children:new Map(), payload:null });
      cur = cur.children.get(name);
      if (isLeaf) cur.payload = r;
    }
  }
  return root;
}

function handleTreeKeydown(e, row, tree) {
  const rows = Array.from(document.querySelectorAll('#treeContainer .row'));
  const currentIndex = rows.indexOf(row);
  const expandBtn = row.querySelector('button:first-child');
  const copyBtn = row.querySelector('.copy-btn');

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (currentIndex < rows.length - 1) {
        rows[currentIndex + 1].focus();
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (currentIndex > 0) {
        rows[currentIndex - 1].focus();
      }
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (expandBtn && expandBtn.textContent === '▸') {
        expandBtn.click();
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (expandBtn && expandBtn.textContent === '▾') {
        expandBtn.click();
      }
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (document.activeElement === copyBtn) {
        copyBtn.click();
      } else if (expandBtn) {
        expandBtn.click();
      }
      break;
  }
}

export function renderTree(container, tree){
  container.textContent = '';
  const only = state.filters.onlyOrphans;
  const frag = document.createDocumentFragment();
  let hasVisibleNodes = false;
  function hasMatchingDescendant(node) {
    if (!state.search) return false;
    const searchLower = state.search.toLowerCase();
    const path = node.payload ? (node.payload.directory || node.payload.node) : node.name;
    if (path.toLowerCase().includes(searchLower)) return true;
    for (const child of node.children.values()) {
      if (hasMatchingDescendant(child)) return true;
    }
    return false;
  }

  function hasOrphanDescendant(node) {
    if (node.payload?.orphan) return true;
    for (const child of node.children.values()) {
      if (hasOrphanDescendant(child)) return true;
    }
    return false;
  }

  function nodeRow(node, depth){
    const r = node.payload;
    const orphan = !!r?.orphan;
    const path = r ? (r.directory || r.node) : node.name;
    const matchesSearch = !state.search || path.toLowerCase().includes(state.search.toLowerCase());
    const hasMatchingChild = hasMatchingDescendant(node);
    if (only && !orphan && (node.kind !== 'dir' || !hasOrphanDescendant(node))) return null;
    if (!matchesSearch && !hasMatchingChild) return null;
    const row = document.createElement('div');
    row.className = 'row';
    row.style.paddingLeft = `${depth*12}px`;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-level', (depth + 1).toString());
    row.setAttribute('aria-expanded', 'false');
    row.onkeydown = (e) => handleTreeKeydown(e, row, tree);
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', node.children.size ? 'Expand' : 'Leaf node');
    btn.textContent = node.children.size ? '▸' : '•';
    if (hasMatchingChild) {
      btn.classList.add('has-matches');
      btn.title = 'Contains matching items';
    }
    const label = document.createElement('span');
    label.innerHTML = highlightMatches(node.name, state.search);
    // Add orphan class when unchecked and node is orphan
    if (orphan && !state.filters.onlyOrphans) label.classList.add('orphan');
    const copy = document.createElement('button');
    copy.className = 'copy-btn';
    copy.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    copy.title = 'Copy path to clipboard';
    copy.onclick = () => copyText(r ? (r.directory || r.node) : node.name);
    const tip = document.createElement('span'); tip.className='tip';
    if (r){
      const sz = humanBytes(r['size-bytes']);
      const indeg = r['in-degree'];
      const fcnt = r['file-count'];
      tip.textContent = r.directory ? ` files:${fcnt ?? '–'} size:${sz}` : ` size:${sz} in-degree:${indeg ?? '–'}`;
    }
    const header = document.createElement('div'); header.className='row-head';
    header.append(btn,label,copy,tip);
    row.appendChild(header);
    frag.appendChild(row);
    let expanded = false;
    if (node.children.size){
      const toggle = () => {
        expanded = !expanded;
        btn.textContent = expanded ? '▾' : '▸';
        btn.setAttribute('aria-label', expanded ? 'Collapse' : 'Expand');
        row.setAttribute('aria-expanded', expanded.toString());
        if (expanded){
          for(const child of node.children.values()){
            const childRow = nodeRow(child, depth+1);
            if (childRow) {
              // Insert child row after the current row
              row.parentNode.insertBefore(childRow, row.nextSibling);
            }
          }
        } else {
          // Remove all child rows
          let next = row.nextSibling;
          while (next && next.style.paddingLeft > row.style.paddingLeft) {
            const toRemove = next;
            next = next.nextSibling;
            toRemove.remove();
          }
        }
      };
      btn.onclick = toggle;
    }
    hasVisibleNodes = true;
    return row;
  }
  for(const child of tree.children.values()){ nodeRow(child, 0); }
  if (!hasVisibleNodes) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = state.search
      ? 'No files or directories match your search'
      : only
        ? 'No orphaned files or directories found'
        : 'No files or directories found';
    container.appendChild(empty);
  } else {
    container.appendChild(frag);
  }
}


