#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { 
  scanFiles,
  parseFile,
  resolveImport,
  Graph,
  reportGraph,
  findOrphans
} = require('../dist/index');

const program = new Command();

program
  .version('0.1.0')
  .option('--root <path>', 'Root directory of the project to scan', process.cwd())
  .option('--extensions <extensions>', 'Comma-separated list of file extensions to include', 'js,ts,jsx,tsx')
  .option('--exclude <patterns>', 'Comma-separated list of glob patterns to exclude')
  .option('--out <path>', 'Output file path for the report (without extension)', 'codereap-report')
  .option('--pretty', 'Prettify JSON output')
  .parse(process.argv);

const options = program.opts();

async function main() {
  const root = path.resolve(options.root);
  const extensions = options.extensions.split(',');
  const exclude = options.exclude ? options.exclude.split(',') : [];

  const tsconfigPath = path.join(root, 'tsconfig.json');
  let rootDir, outDir;
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    if (tsconfig.compilerOptions) {
      rootDir = tsconfig.compilerOptions.rootDir ? path.join(root, tsconfig.compilerOptions.rootDir) : undefined;
      outDir = tsconfig.compilerOptions.outDir ? path.join(root, tsconfig.compilerOptions.outDir) : undefined;
    }
  }

  const packageJsonPath = path.join(root, 'package.json');
  let entrypoints = [];
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const main = packageJson.main ? [path.resolve(root, packageJson.main)] : [];
    const module = packageJson.module ? [path.resolve(root, packageJson.module)] : [];
    const bin = packageJson.bin ? Object.values(packageJson.bin).map(p => path.resolve(root, p)) : [];
    
    const rawEntrypoints = [...main, ...module, ...bin];
    entrypoints = rawEntrypoints.map(p => {
      if (rootDir && outDir && p.includes(outDir)) {
        const sourceFile = p.replace(outDir, rootDir).replace('.js', '.ts');
        if(fs.existsSync(sourceFile)) return sourceFile;
      }
      return p;
    }).filter(Boolean);
  }
  
  console.log('Project Source Entrypoints:', entrypoints);

  console.log(`Scanning for source files...`);
  const files = await scanFiles(root, extensions, exclude, rootDir);
  const sourceFiles = new Set(files);
  console.log(`Found ${files.length} source files.`);

  const graph = new Graph();
  for (const file of files) {
    graph.addNode(file);
  }
  // Also add the JS entrypoint to the graph so the pruner can start from it
  for (const entrypoint of entrypoints) {
    if (entrypoint.endsWith('.js')) {
      graph.addNode(entrypoint);
    }
  }


  console.log('Parsing files and building dependency graph...');
  const allFilesToParse = [...files];
  // Also parse the JS entrypoint
  for (const entrypoint of entrypoints) {
    if (entrypoint.endsWith('.js')) {
      allFilesToParse.push(entrypoint);
    }
  }


  await Promise.all(
    allFilesToParse.map(async (file) => {
      const { imports } = await parseFile(file);
      for (const imp of imports) {
        let resolved = resolveImport(file, imp);
        if (resolved) {
          if (rootDir && outDir && resolved.includes(outDir)) {
            const sourceFile = resolved.replace(outDir, rootDir).replace('.js', '.ts');
            if(fs.existsSync(sourceFile)) resolved = sourceFile;
          }

          if (graph.nodes.has(resolved)) {
             graph.addEdge(file, resolved);
          }
        }
      }
    })
  );

  console.log('Generating report...');
  await reportGraph(graph, options.out, options.pretty);
  console.log(`Report generated at ${options.out}.json and ${options.out}.csv`);

  console.log('Finding orphans...');
  const orphans = findOrphans(graph, entrypoints, exclude);
  console.log('Orphan files:');
  orphans.forEach(orphan => console.log(orphan));
  
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
