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
  reportDirectories,
  findOrphans,
  computeLiveFiles,
  loadCodereapConfig,
  loadTsJsConfig,
  mergeResolutionOptions,
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
  .option(
    '--dirOnly',
    'Aggregate at directory level and report orphan directories'
  )
  .option('--onlyOrphans', 'When writing reports, include only orphan rows')
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

  // Determine effective output settings early (for gating symbol collection later)
  const effectiveFormat =
    getSrc('format') === 'cli' ? options.format : fileCfg.format;
  const effectiveOut =
    getSrc('out') === 'cli' ? options.out : fileCfg.out || options.out;
  const effectiveOnlyOrphans = options.onlyOrphans === true;
  const collectSymbols = effectiveFormat === 'json';

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

    // Extract script entrypoints (always include behavior)
    const scriptEntrypoints = new Set();
    const extsPattern = '(?:js|jsx|ts|tsx)';
    const runners = [
      'node',
      'nodemon',
      'pm2\\s+start',
      'ts-node(?:\\S*)?',
      'tsx',
      'babel-node',
    ];
    const runnerRegex = new RegExp(
      `(?:^|\\s)(?:${runners.join(
        '|'
      )})\\s+([\"\']?)([^\s\"\']+\.${extsPattern})(?:\\1)(?=\s|$)`,
      'i'
    );
    const fileRegex = new RegExp(
      `(^|\\s)([^\\s]+\\.${extsPattern})(?=\\s|$)`,
      'i'
    );
    const splitRegex = /\s*(?:&&|\|\||;|\n)\s*/g;

    if (packageJson.scripts && typeof packageJson.scripts === 'object') {
      for (const val of Object.values(packageJson.scripts)) {
        if (typeof val !== 'string' || !val) continue;
        const parts = val.split(splitRegex);
        for (const part of parts) {
          let m = part.match(runnerRegex);
          if (m && m[2]) {
            const candidate = m[2];
            scriptEntrypoints.add(candidate);
            continue;
          }
          // fallback: bare file token
          m = part.match(fileRegex);
          if (m && m[2]) {
            const candidate = m[2];
            scriptEntrypoints.add(candidate);
          }
        }
      }
    }

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

    // Append script entrypoints (resolve relative to root, map built->source when possible)
    for (const rel of scriptEntrypoints) {
      const abs = path.resolve(root, rel);
      let finalPath = abs;
      if (rootDir && outDir && abs.includes(outDir)) {
        const sourceFile = abs.replace(outDir, rootDir).replace('.js', '.ts');
        if (fs.existsSync(sourceFile)) finalPath = sourceFile;
      }
      if (fs.existsSync(finalPath)) {
        entrypoints.push(finalPath);
      }
    }
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
  // Collect per-file symbols when JSON output is requested
  const fileToSymbols = new Map();
  const allFilesToParse = [...files];
  // Also parse the JS entrypoint
  for (const entrypoint of entrypoints) {
    if (entrypoint.endsWith('.js')) {
      allFilesToParse.push(entrypoint);
    }
  }

  await Promise.all(
    allFilesToParse.map(async (file) => {
      const { imports, importSpecs, exportsInfo, exportUsage } =
        await parseFile(file, {
          collectSymbols,
        });
      for (const imp of imports) {
        let resolved = resolveImport(file, imp, {
          root: mergedRoot,
          importRoot,
          paths,
          extensions: extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)),
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

      if (collectSymbols) {
        // Build enriched import specs with resolved absolute targets when in graph
        const enriched = Array.isArray(importSpecs)
          ? importSpecs.map((spec) => {
              let resolved = resolveImport(file, spec.source, {
                root: mergedRoot,
                importRoot,
                paths,
                extensions: extensions.map((e) =>
                  e.startsWith('.') ? e : `.${e}`
                ),
              });
              if (resolved) {
                if (rootDir && outDir && resolved.includes(outDir)) {
                  const sourceFile = resolved
                    .replace(outDir, rootDir)
                    .replace('.js', '.ts');
                  if (fs.existsSync(sourceFile)) resolved = sourceFile;
                }
                if (!graph.nodes.has(resolved)) {
                  resolved = undefined;
                }
              }
              return { ...spec, resolved };
            })
          : [];
        fileToSymbols.set(file, {
          exports: exportsInfo || {
            hasDefault: false,
            named: [],
            reExports: [],
          },
          importSpecs: enriched,
          exportUsage,
        });
      }
    })
  );

  // Build cross-file consumption index for exported symbols (JSON mode only)
  let consumptionIndex = undefined;
  if (collectSymbols) {
    const map = new Map();
    for (const [, info] of fileToSymbols.entries()) {
      const specs = info.importSpecs || [];
      for (const spec of specs) {
        if (!spec || !spec.resolved) continue;
        if (spec.kind === 'dynamic') continue;
        const key = spec.resolved;
        if (!map.has(key)) {
          map.set(key, {
            defaultConsumed: false,
            namespaceConsumed: false,
            namedConsumed: new Set(),
          });
        }
        const entry = map.get(key);
        if (spec.imported.default) entry.defaultConsumed = true;
        if (spec.imported.namespace) entry.namespaceConsumed = true;
        if (Array.isArray(spec.imported.named)) {
          for (const nm of spec.imported.named) entry.namedConsumed.add(nm);
        }
      }
    }
    consumptionIndex = map;
  }

  if (effectiveFormat === 'json' || effectiveFormat === 'csv') {
    console.log('Generating report...');
    // Compute live files via reachability from entrypoints
    const liveFiles = computeLiveFiles(graph, entrypoints);
    const writtenPath = options.dirOnly
      ? await reportDirectories(
          graph,
          effectiveOut,
          mergedRoot,
          effectiveFormat,
          options.onlyOrphans,
          liveFiles
        )
      : await reportGraph(
          graph,
          effectiveOut,
          mergedRoot,
          effectiveFormat,
          options.onlyOrphans,
          liveFiles,
          collectSymbols ? fileToSymbols : undefined,
          collectSymbols ? consumptionIndex : undefined,
          collectSymbols
            ? new Map(
                Array.from(fileToSymbols.entries()).map(([k, v]) => [
                  k,
                  v.exportUsage || undefined,
                ])
              )
            : undefined
        );
    console.log(`Report generated at ${writtenPath}`);
  }

  if (options.dirOnly) {
    console.log('Finding orphan directories...');
    // Count directories with orphan=true
    const liveFiles = computeLiveFiles(graph, entrypoints);
    const dirRecords = require('../dist/reporter').computeDirectoryRecords(
      graph,
      mergedRoot,
      liveFiles
    );
    const orphanDirs = dirRecords.filter((r) => r.orphan);
    console.log(`Orphan directories count: ${orphanDirs.length}`);
  } else {
    console.log('Finding orphans...');
    // Reachability-based orphan files
    const liveFiles = computeLiveFiles(graph, entrypoints);
    const orphans = [...graph.nodes].filter((n) => !liveFiles.has(n));
    // Apply exclude patterns at the end for printing consistency
    const micromatch = require('micromatch');
    const filtered =
      exclude && exclude.length > 0
        ? micromatch.not(orphans, exclude)
        : orphans;
    console.log(`Orphan files count: ${filtered.length}`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
