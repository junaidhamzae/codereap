#!/usr/bin/env node
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function extractExports(src){
  const names = new Set();
  const exportConstRe = /^\s*export\s+const\s+(\w+)\s*=/gm;
  const exportFuncRe = /^\s*export\s+function\s+(\w+)\s*\(/gm;
  const exportListRe = /^\s*export\s*\{([^}]+)\}\s*;?\s*$/gm;
  let m;
  while ((m = exportConstRe.exec(src))) names.add(m[1]);
  while ((m = exportFuncRe.exec(src))) names.add(m[1]);
  while ((m = exportListRe.exec(src))){
    const parts = m[1].split(',').map(s=>s.trim()).filter(Boolean).map(s=> s.includes(' as ')? s.split(/\s+as\s+/)[0].trim() : s);
    parts.forEach(n=>names.add(n));
  }
  return Array.from(names);
}

function transformToCjs(src){
  const names = extractExports(src);
  let out = src;
  out = out.replace(/^\s*export\s+const\s+(\w+)\s*=/gm, 'const $1 =');
  out = out.replace(/^\s*export\s+function\s+(\w+)\s*\(/gm, 'function $1(');
  out = out.replace(/^\s*export\s*\{[^}]+\}\s*;?\s*$/gm, '');
  if (names.length){
    out += '\n\n// CJS re-exports\n';
    for (const n of names){ out += `exports.${n} = ${n};\n`; }
  }
  return out;
}

async function main(){
  const inDir = path.resolve(__dirname, '../dist/viewer');
  const outDir = path.resolve(__dirname, '../dist/viewer-cjs');
  if (!fs.existsSync(inDir)) return;
  await fsp.rm(outDir, { recursive: true, force: true }).catch(()=>{});
  await fsp.mkdir(outDir, { recursive: true });
  const files = ['state.js','parse.js','tree.js','table.js'];
  for (const f of files){
    const srcPath = path.join(inDir, f);
    if (!fs.existsSync(srcPath)) continue;
    const src = await fsp.readFile(srcPath, 'utf8');
    const cjs = transformToCjs(src);
    await fsp.writeFile(path.join(outDir, f), cjs, 'utf8');
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });


