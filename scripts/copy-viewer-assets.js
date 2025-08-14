#!/usr/bin/env node
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

async function ensureDir(dir){ await fsp.mkdir(dir, { recursive: true }); }

async function copyRecursive(src, dest){
  const stat = await fsp.stat(src);
  if (stat.isDirectory()){
    await ensureDir(dest);
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const e of entries){
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.isDirectory()) await copyRecursive(s, d);
      else if (e.isFile()) await fsp.copyFile(s, d);
    }
  } else if (stat.isFile()){
    await ensureDir(path.dirname(dest));
    await fsp.copyFile(src, dest);
  }
}

async function main(){
  const srcRoot = path.resolve(__dirname, '../src/viewer/public');
  const outRoot = path.resolve(__dirname, '../dist/viewer');
  if (!fs.existsSync(srcRoot)) return;
  await ensureDir(outRoot);
  // Remove stale ESM package marker if present from prior builds
  const stalePkg = path.join(outRoot, 'package.json');
  if (fs.existsSync(stalePkg)) { try { await fsp.unlink(stalePkg); } catch (_) {} }
  // Prefer fs.cp when available for efficiency
  if (typeof fs.cp === 'function'){
    await new Promise((resolve, reject)=>{
      fs.cp(srcRoot, outRoot, { recursive: true, force: true }, (err)=> err ? reject(err) : resolve());
    });
  } else {
    await copyRecursive(srcRoot, outRoot);
  }
  // Note: do not write a package.json with type:module here; server.js in this folder is CJS
}

main().catch((err)=>{ console.error(err); process.exit(1); });


