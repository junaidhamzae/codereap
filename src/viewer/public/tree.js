import { state } from './state.js';
import { humanBytes, copyText } from './utils.js';

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

export function renderTree(container, tree){
  container.textContent = '';
  const only = state.filters.onlyOrphans;
  const frag = document.createDocumentFragment();
  function nodeRow(node, depth){
    const r = node.payload;
    const orphan = !!r?.orphan;
    const path = r ? (r.directory || r.node) : node.name;
    const matchesSearch = !state.search || path.toLowerCase().includes(state.search.toLowerCase());
    if ((only && !orphan && node.kind!=='dir') || !matchesSearch) return null;
    const row = document.createElement('div'); row.className='row'; row.style.paddingLeft = `${depth*12}px`;
    const btn = document.createElement('button'); btn.textContent = node.children.size ? '▸' : '•';
    const label = document.createElement('span'); label.textContent = node.name; if (orphan) label.classList.add('orphan');
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
        expanded = !expanded; btn.textContent = expanded ? '▾' : '▸';
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
    return row;
  }
  for(const child of tree.children.values()){ nodeRow(child, 0); }
  container.appendChild(frag);
}


