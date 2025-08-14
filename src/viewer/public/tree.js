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
    if (only && !orphan && node.kind!=='dir') return null;
    const row = document.createElement('div'); row.className='row'; row.style.paddingLeft = `${depth*12}px`;
    const btn = document.createElement('button'); btn.textContent = node.children.size ? '▸' : '•';
    const label = document.createElement('span'); label.textContent = node.name; if (orphan) label.classList.add('orphan');
    const copy = document.createElement('button'); copy.textContent = 'Copy';
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
    frag.append(header);
    let expanded = false;
    if (node.children.size){
      const toggle = () => {
        expanded = !expanded; btn.textContent = expanded ? '▾' : '▸';
        if (expanded){
          for(const child of node.children.values()){
            const childRow = nodeRow(child, depth+1); if (childRow) {}
          }
        } else {
          // re-render entire tree lazily to avoid deep DOM operations
          renderTree(container, tree);
        }
      };
      btn.onclick = toggle;
    }
    return row;
  }
  for(const child of tree.children.values()){ nodeRow(child, 0); }
  container.appendChild(frag);
}


