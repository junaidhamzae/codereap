#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');
const { 
  scanFiles,
  parseFile,
  resolveImport,
  Graph,
  reportGraph,
  findOrphans,
  loadCodereapConfig,
  loadTsJsConfig,
  mergeResolutionOptions
} = require('../dist/index');

const program = new Command();

program
  .version(pkg.version)
  .option(
    '--root <path>',
    'Root directory of the project to scan',
    process.cwd()
  )
  .option(
    '--extensions <extensions>',
    'Comma-separated list of file extensions to include',
    'js,ts,jsx,tsx,json,css,scss'
  )
  .option(
    '--exclude <patterns>',
    'Comma-separated list of glob patterns to exclude'
  )
  .option(
    '--out <path>',
    'Output file path for the report (without extension)',
    'codereap-report'
  )
  .option('--config <path>', 'Path to codereap.config.json (optional)')
  .option(
    '--importRoot <path>',
    'Directory to resolve non-relative imports from (overrides ts/jsconfig and file config)'
  )
  .option(
    '--alias <mapping>',
    'Alias mapping pattern=target; repeat or comma-separate (e.g. "@/*=src/*,components/*=src/components/*")'
  )
  .option(
    '--format <type>',
    'Output format: json or csv (omit to skip writing files)'
  )
  .parse(process.argv);

const options = program.opts();

async function main() {
  const root = path.resolve(options.root);

  const getSrc = (name) => program.getOptionValueSource(name);

  // Load ts/jsconfig baseUrl & paths
  const tsjs = loadTsJsConfig(root);

  // Load codereap.config.json
  const fileCfg = loadCodereapConfig(root, options.config);

  const extensions =
    getSrc('extensions') === 'cli'
      ? options.extensions.split(',')
      : Array.isArray(fileCfg.extensions) && fileCfg.extensions.length > 0
      ? fileCfg.extensions
      : options.extensions.split(',');

  const exclude =
    getSrc('exclude') === 'cli'
      ? options.exclude
        ? options.exclude.split(',')
        : []
      : Array.isArray(fileCfg.exclude)
      ? fileCfg.exclude
      : [];

  // Parse CLI alias mappings into paths-style object
  let cliPaths = undefined;
  if (options.alias) {
    const chunks = String(options.alias).split(',');
    cliPaths = {};
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const pattern = trimmed.slice(0, eq).trim();
      const target = trimmed.slice(eq + 1).trim();
      if (!pattern || !target) continue;
      cliPaths[pattern] = [target];
    }
  }

  const cliImportRoot = options.importRoot
    ? path.resolve(root, options.importRoot)
    : undefined;
  const {
    root: mergedRoot,
    importRoot,
    paths,
  } = mergeResolutionOptions(
    root,
    { importRoot: cliImportRoot, paths: cliPaths },
    { importRoot: fileCfg.importRoot, paths: fileCfg.paths },
    tsjs
  );

  // Also collect tsconfig rootDir/outDir for mapping built to source files
  const tsconfigPath = path.join(root, 'tsconfig.json');
  let rootDir, outDir;
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    if (tsconfig.compilerOptions) {
      rootDir = tsconfig.compilerOptions.rootDir
        ? path.join(root, tsconfig.compilerOptions.rootDir)
        : undefined;
      outDir = tsconfig.compilerOptions.outDir
        ? path.join(root, tsconfig.compilerOptions.outDir)
        : undefined;
    }
  }

  const packageJsonPath = path.join(root, 'package.json');
  let entrypoints = [];
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const main = packageJson.main ? [path.resolve(root, packageJson.main)] : [];
    const module = packageJson.module
      ? [path.resolve(root, packageJson.module)]
      : [];
    const bin = packageJson.bin
      ? Object.values(packageJson.bin).map((p) => path.resolve(root, p))
      : [];

    const rawEntrypoints = [...main, ...module, ...bin];
    entrypoints = rawEntrypoints
      .map((p) => {
        if (rootDir && outDir && p.includes(outDir)) {
          const sourceFile = p.replace(outDir, rootDir).replace('.js', '.ts');
          if (fs.existsSync(sourceFile)) return sourceFile;
        }
        return p;
      })
      .filter(Boolean);
  }

  console.log('Project Source Entrypoints:', entrypoints);

  console.log(`Scanning for source files...`);
  const files = await scanFiles(mergedRoot, extensions, exclude, rootDir);
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
        let resolved = resolveImport(file, imp, {
          root: mergedRoot,
          importRoot,
          paths,
        });
        if (resolved) {
          if (rootDir && outDir && resolved.includes(outDir)) {
            const sourceFile = resolved
              .replace(outDir, rootDir)
              .replace('.js', '.ts');
            if (fs.existsSync(sourceFile)) resolved = sourceFile;
          }

          if (graph.nodes.has(resolved)) {
            graph.addEdge(file, resolved);
          }
        }
      }
    })
  );

  const effectiveFormat =
    getSrc('format') === 'cli' ? options.format : fileCfg.format;
  const effectiveOut =
    getSrc('out') === 'cli' ? options.out : fileCfg.out || options.out;

  if (effectiveFormat === 'json' || effectiveFormat === 'csv') {
    console.log('Generating report...');
    const writtenPath = await reportGraph(
      graph,
      effectiveOut,
      mergedRoot,
      effectiveFormat
    );
    console.log(`Report generated at ${writtenPath}`);
  }

  console.log('Finding orphans...');
  const orphans = findOrphans(graph, entrypoints, exclude);
  console.log(`Orphan files count: ${orphans.length}`);

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
