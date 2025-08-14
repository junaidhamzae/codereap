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
  // Prefer fs.cp when available for efficiency
  if (typeof fs.cp === 'function'){
    await new Promise((resolve, reject)=>{
      fs.cp(srcRoot, outRoot, { recursive: true, force: true }, (err)=> err ? reject(err) : resolve());
    });
  } else {
    await copyRecursive(srcRoot, outRoot);
  }
  // Ensure Node treats dist/viewer/*.js as ESM for tests and tooling
  const pkgPath = path.join(outRoot, 'package.json');
  await fsp.writeFile(pkgPath, JSON.stringify({ type: 'module' }, null, 2));
}

main().catch((err)=>{ console.error(err); process.exit(1); });


