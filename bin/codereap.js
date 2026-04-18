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
  writeCache,
  readCache,
  purgeCache,
  getCachePath,
  CacheNotFoundError,
  CacheVersionMismatchError,
  CacheRootMismatchError,
  traceFile,
  formatTraceResult,
  traceResultToJSON,
  FileNotInAnalysisError,
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
    'Output file path for the report (without extension; defaults to {root}/codereap-report)'
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
    '--dirOnly',
    'Aggregate at directory level and report orphan directories'
  )
  .option('--onlyOrphans', 'When writing reports, include only orphan rows')
  .option(
    '--frameworkEntrypoints <mode>',
    'Framework entrypoint seeding: auto or off (default: auto)',
    'auto'
  )
  .option(
    '--entry <globs>',
    'Comma-separated glob(s) to add as extra entrypoints (relative to --root)'
  )
  .option(
    '--alwaysLive <globs>',
    'Comma-separated glob(s) to mark as always-live (relative to --root)'
  )
  .option(
    '--dynamicEdges <mode>',
    'Treat string-literal dynamic imports as edges: on or off (default: on)',
    'on'
  )
  .option('--viewer', 'Start built-in local viewer (serve static UI)')
  .option('--port <port>', 'Viewer port (default: 0 for ephemeral)')
  .option('--host <host>', 'Viewer host (default: 127.0.0.1)', '127.0.0.1')
  .option('--no-open', 'Do not open browser automatically')
  .option('--purge-cache', 'Delete the analysis cache file and exit')
  .option('--cachePath <path>', 'Override cache file location (without .json extension)');

// Handle the trace subcommand before Commander parses (avoids subcommand interference)
const isTraceCommand = process.argv.length > 2 && process.argv[2] === 'trace';

if (isTraceCommand) {
  // Use a separate Commander instance for robust arg parsing + --help support
  const traceProgram = new Command('codereap trace');
  traceProgram
    .description('Trace why a file is live or orphan using the analysis cache')
    .argument('<file>', 'File path to trace (relative to --root or absolute)')
    .option('--all', 'Show all chains and entrypoints (no truncation)', false)
    .option('--json', 'Output trace results as JSON', false)
    .option('--root <path>', 'Root directory of the project', process.cwd())
    .option('--cachePath <path>', 'Override cache file location')
    .action(async (file, opts) => {
      try {
        const root = path.resolve(opts.root);
        // Resolve effective cache path: CLI > config > default
        let effectiveCachePath = opts.cachePath ? path.resolve(opts.cachePath) : undefined;
        if (!effectiveCachePath) {
          const fileCfg = loadCodereapConfig(root);
          if (fileCfg.cachePath) effectiveCachePath = fileCfg.cachePath;
        }
        const cache = await readCache(root, pkg.version, effectiveCachePath);
        const result = traceFile(file, cache, root);
        if (opts.json) {
          console.log(JSON.stringify(traceResultToJSON(result, root), null, 2));
        } else {
          console.log(formatTraceResult(result, root, { showAll: opts.all }));
        }
      } catch (err) {
        if (
          err instanceof CacheNotFoundError ||
          err instanceof CacheVersionMismatchError ||
          err instanceof CacheRootMismatchError ||
          err instanceof FileNotInAnalysisError
        ) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        throw err;
      }
    });
  traceProgram.parseAsync(process.argv.slice(1)).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
  const options = program.opts();
  main(options).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

async function main(options) {
  const root = path.resolve(options.root);

  const getSrc = (name) => program.getOptionValueSource(name);

  // Resolve effective cache path early: CLI --cachePath > config cachePath > default
  const fileCfgEarly = loadCodereapConfig(root, options.config);
  const effectiveCachePath = options.cachePath
    ? path.resolve(options.cachePath)
    : fileCfgEarly.cachePath || undefined;

  // Handle --purge-cache
  if (options.purgeCache) {
    const deleted = await purgeCache(root, effectiveCachePath);
    if (deleted) {
      console.log(`Cache purged: ${getCachePath(root, effectiveCachePath)}`);
    } else {
      console.log('No cache file found.');
    }
    return;
  }

  // Viewer short-circuit
  if (options.viewer) {
    const { startViewerServer } = require('../dist/viewer/server');
    const viewer = await startViewerServer({
      host: options.host || '127.0.0.1',
      port: options.port ? Number(options.port) : 0,
      open: options.open !== false,
    });
    console.log(`viewer listening on ${viewer.url}`);
    process.on('SIGINT', async () => { await viewer.close(); process.exit(0); });
    await new Promise(() => {});
    return;
  }

  // Load ts/jsconfig baseUrl & paths
  const tsjs = loadTsJsConfig(root);

  // Reuse config loaded earlier (for cachePath resolution)
  const fileCfg = fileCfgEarly;

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
  // When --out is not explicitly provided, default to project root (not CWD)
  const effectiveOut =
    getSrc('out') === 'cli'
      ? options.out
      : fileCfg.out
        ? fileCfg.out
        : path.join(root, 'codereap-report');
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

  /** Map a built JS path back to its TypeScript source when rootDir/outDir are configured */
  function mapBuiltToSource(resolved) {
    if (rootDir && outDir && resolved.includes(outDir)) {
      const sourceFile = resolved.replace(outDir, rootDir).replace('.js', '.ts');
      if (fs.existsSync(sourceFile)) return sourceFile;
    }
    return resolved;
  }

  const packageJsonPath = path.join(root, 'package.json');
  let entrypoints = [];
  let packageJson = undefined;
  if (fs.existsSync(packageJsonPath)) {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
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

    // Match runner + path without requiring file extension (e.g. "node scripts/prebuild")
    const runnerNoExtRegex = new RegExp(
      `(?:^|\\s)(?:${runners.join('|')})\\s+([\"\']?)([^\\s\"\']+)(?:\\1)(?=\\s|$)`,
      'i'
    );

    if (packageJson.scripts && typeof packageJson.scripts === 'object') {
      for (const val of Object.values(packageJson.scripts)) {
        if (typeof val !== 'string' || !val) continue;
        const parts = val.split(splitRegex);
        for (const part of parts) {
          // 1) runner + file with extension
          let m = part.match(runnerRegex);
          if (m && m[2]) {
            const candidate = m[2];
            scriptEntrypoints.add(candidate);
            continue;
          }
          // 2) bare file token with extension
          m = part.match(fileRegex);
          if (m && m[2]) {
            const candidate = m[2];
            scriptEntrypoints.add(candidate);
            continue;
          }
          // 3) runner + path without extension (e.g. "node scripts/prebuild")
          m = part.match(runnerNoExtRegex);
          if (m && m[2]) {
            const candidate = m[2];
            // Skip flags/options and obvious non-paths
            if (!candidate.startsWith('-') && candidate.includes('/')) {
              scriptEntrypoints.add(candidate);
            }
          }
        }
      }
    }

    const rawEntrypoints = [...main, ...module, ...bin];
    entrypoints = rawEntrypoints.map(mapBuiltToSource).filter(Boolean);

    // Append script entrypoints (resolve relative to root, map built->source when possible)
    for (const rel of scriptEntrypoints) {
      const abs = path.resolve(root, rel);
      const finalPath = mapBuiltToSource(abs);
      if (fs.existsSync(finalPath)) {
        // If it's a directory, try to resolve to index file
        if (fs.statSync(finalPath).isDirectory()) {
          const scriptExts = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];
          let found = false;
          for (const ext of scriptExts) {
            const indexFile = path.join(finalPath, 'index' + ext);
            if (fs.existsSync(indexFile)) {
              entrypoints.push(indexFile);
              found = true;
              break;
            }
          }
          if (!found) {
            entrypoints.push(finalPath);
          }
        } else {
          entrypoints.push(finalPath);
        }
      } else {
        // Try appending extensions if file doesn't exist as-is
        const scriptExts = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];
        for (const ext of scriptExts) {
          const withExt = finalPath + ext;
          if (fs.existsSync(withExt)) {
            entrypoints.push(withExt);
            break;
          }
        }
      }
    }
  }

  console.log(
    'Project Source Entrypoints (relative):',
    entrypoints.map((p) => path.relative(root, p))
  );

  // Resolve framework and user-provided entrypoint globs
  const fg = require('fast-glob');
  const extsPattern = `.{js,jsx,ts,tsx}`;
  const ignorePatterns = exclude && exclude.length > 0 ? exclude : [];

  // Helper to resolve globs to abs paths
  const resolveGlobs = (globs) => {
    if (!globs || globs.length === 0) return [];
    const patterns = Array.isArray(globs) ? globs : [globs];
    const res = fg.sync(patterns, {
      cwd: root,
      absolute: true,
      ignore: ignorePatterns,
      dot: false,
    });
    return res;
  };

  // Next.js detection and seeding
  const frameworkMode = (options.frameworkEntrypoints || 'auto').toLowerCase();
  let nextDetected = false;
  if (frameworkMode === 'auto') {
    const hasNextDep =
      packageJson &&
      ((packageJson.dependencies && packageJson.dependencies.next) ||
        (packageJson.devDependencies && packageJson.devDependencies.next));
    const hasNextConfig =
      fs.existsSync(path.join(root, 'next.config.js')) ||
      fs.existsSync(path.join(root, 'next.config.mjs'));
    const hasNextScript =
      packageJson &&
      packageJson.scripts &&
      Object.values(packageJson.scripts).some(
        (s) => typeof s === 'string' && /\bnext\s+(dev|start|build)\b/.test(s)
      );
    nextDetected = Boolean(hasNextDep || hasNextConfig || hasNextScript);
  }

  if (frameworkMode === 'auto' && nextDetected) {
    const nextGlobs = [
      // Pages Router
      `pages/**/*${extsPattern}`,
      `src/pages/**/*${extsPattern}`,
      // API routes
      `pages/api/**/*${extsPattern}`,
      `src/pages/api/**/*${extsPattern}`,
      // Special files
      `pages/_app${extsPattern}`,
      `pages/_document${extsPattern}`,
      `pages/_error${extsPattern}`,
      `src/pages/_app${extsPattern}`,
      `src/pages/_document${extsPattern}`,
      `src/pages/_error${extsPattern}`,
      // App Router (support under root and src/)
      `app/**/page${extsPattern}`,
      `app/**/layout${extsPattern}`,
      `app/**/error${extsPattern}`,
      `app/**/loading${extsPattern}`,
      `app/**/not-found${extsPattern}`,
      `src/app/**/page${extsPattern}`,
      `src/app/**/layout${extsPattern}`,
      `src/app/**/error${extsPattern}`,
      `src/app/**/loading${extsPattern}`,
      `src/app/**/not-found${extsPattern}`,
      // Middleware
      `middleware.{js,ts}`,
      `src/middleware.{js,ts}`,
      // Next.js config (auto-loaded by framework)
      `next.config.{js,mjs,ts}`,
      // Instrumentation hooks (Next.js 13+)
      `instrumentation.{js,ts,mjs}`,
      `instrumentation-client.{js,ts,mjs}`,
      `src/instrumentation.{js,ts,mjs}`,
      `src/instrumentation-client.{js,ts,mjs}`,
    ];
    const resolved = resolveGlobs(nextGlobs);
    if (resolved.length > 0) {
      console.log(
        `Next.js detected; seeding ${resolved.length} entrypoints via conventions.`
      );
      entrypoints.push(...resolved);
    }
  }

  // Storybook detection and seeding
  if (frameworkMode === 'auto') {
    const storybookMainCandidates = [
      '.storybook/main.ts',
      '.storybook/main.js',
      '.storybook/main.mjs',
      '.storybook/main.tsx',
      '.storybook/main.jsx',
    ];
    let storybookMainPath = null;
    for (const candidate of storybookMainCandidates) {
      const absCandidate = path.join(root, candidate);
      if (fs.existsSync(absCandidate)) {
        storybookMainPath = absCandidate;
        break;
      }
    }
    if (storybookMainPath) {
      // Seed .storybook/main and .storybook/preview as entrypoints
      const storybookEntryGlobs = [
        `.storybook/main${extsPattern}`,
        `.storybook/preview${extsPattern}`,
      ];
      const storybookEntries = resolveGlobs(storybookEntryGlobs);
      if (storybookEntries.length > 0) {
        entrypoints.push(...storybookEntries);
      }

      // Parse the stories globs from .storybook/main.*
      try {
        const mainContent = fs.readFileSync(storybookMainPath, 'utf-8');
        // Match stories array entries: patterns like '../components/**/*.stories.@(js|jsx|ts|tsx|mdx)'
        const storiesGlobs = [];
        const storiesRegex = /stories\s*:\s*\[([^\]]*)\]/s;
        const storiesMatch = mainContent.match(storiesRegex);
        if (storiesMatch) {
          const arrayContent = storiesMatch[1];
          // Extract string literals from the array
          const stringRegex = /['"]([^'"]+)['"]/g;
          let strMatch;
          while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
            storiesGlobs.push(strMatch[1]);
          }
        }
        if (storiesGlobs.length > 0) {
          // Resolve relative to .storybook/ directory
          const storybookDir = path.dirname(storybookMainPath);
          const resolvedStories = [];
          for (const pattern of storiesGlobs) {
            try {
              const matches = fg.sync(pattern, {
                cwd: storybookDir,
                absolute: true,
                ignore: ignorePatterns,
                dot: false,
              });
              resolvedStories.push(...matches);
            } catch (_e) {
              // skip unresolvable patterns
            }
          }
          if (resolvedStories.length > 0) {
            console.log(
              `Storybook detected; seeding ${resolvedStories.length} story entrypoints.`
            );
            entrypoints.push(...resolvedStories);
          }
        }
      } catch (_e) {
        // skip if we can't read storybook config
      }
    }
  }

  // User-provided extra entries
  if (options.entry) {
    const userGlobs = String(options.entry)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const resolved = resolveGlobs(userGlobs);
    if (resolved.length > 0) {
      console.log(`User entry globs resolved to ${resolved.length} files.`);
      entrypoints.push(...resolved);
    }
  }

  // Auto-exclude well-known tooling/convention files from being flagged as orphans.
  // These files are consumed by tools via filename convention, never via import.
  const conventionFileGlobs = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'tsconfig.*.json',
    'jsconfig.json',
    'next-env.d.ts',
    '.eslintrc',
    '.eslintrc.*',
    'eslint.config.*',
    '.prettierrc',
    '.prettierrc.*',
    'prettier.config.*',
    '.babelrc',
    '.babelrc.*',
    'babel.config.*',
    'jest.config.*',
    'vitest.config.*',
    'playwright.config.*',
    'cypress.config.*',
    '.env',
    '.env.*',
    'Dockerfile',
    'docker-compose.*',
    'Dockerrun.aws.json',
  ];

  // Resolve convention files to absolute paths for always-live treatment
  const conventionAlwaysLive = resolveGlobs(conventionFileGlobs);
  if (conventionAlwaysLive.length > 0) {
    console.log(`Auto-marking ${conventionAlwaysLive.length} convention/tooling files as always-live.`);
  }

  // De-duplicate entrypoints
  entrypoints = Array.from(new Set(entrypoints));

  // Merge alwaysLive from CLI flag and config file
  const alwaysLiveGlobs = [
    ...(options.alwaysLive ? String(options.alwaysLive).split(',').map(s => s.trim()).filter(Boolean) : []),
    ...(fileCfg.alwaysLive || []),
  ];

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

  const dynamicEdgesOn =
    String(options.dynamicEdges || 'on').toLowerCase() !== 'off';

  // Build resolver extensions list with .d.ts always included for TypeScript declaration files
  const resolverExts = extensions.map((e) => (e.startsWith('.') ? e : `.${e}`));
  if (resolverExts.includes('.ts') && !resolverExts.includes('.d.ts')) {
    resolverExts.splice(resolverExts.indexOf('.ts') + 1, 0, '.d.ts');
  }

  // Maps for cross-file constant propagation (glob resolution)
  const fileExportsInfo = new Map();    // abs path → exportsInfo (with namedConstValues)
  const fileUnresolvedGlobs = new Map(); // abs path → unresolvedGlobRefs[]

  await Promise.all(
    allFilesToParse.map(async (file) => {
      const { imports, importSpecs, exportsInfo, exportUsage, globImports, unresolvedGlobRefs, pathRefs } =
        await parseFile(file, {
          collectSymbols: true,
        });

      // Resolve glob-based imports (e.g. glob.sync('./configs/*.js'))
      // Try resolving relative to the file's directory first, then fall back to project root
      if (Array.isArray(globImports) && globImports.length > 0) {
        const fileDir = path.dirname(file);
        for (const pattern of globImports) {
          try {
            let resolved = fg.sync(pattern, {
              cwd: fileDir,
              absolute: true,
              ignore: ignorePatterns,
              dot: false,
            });
            // If no matches relative to file dir, try relative to project root
            if (resolved.length === 0 && fileDir !== root) {
              resolved = fg.sync(pattern, {
                cwd: root,
                absolute: true,
                ignore: ignorePatterns,
                dot: false,
              });
            }
            for (const target of resolved) {
              if (graph.nodes.has(target)) {
                graph.addEdge(file, target, 'glob');
              }
            }
          } catch (_e) {
            // silently skip unresolvable glob patterns
          }
        }
      }

      // Resolve path.join/path.resolve references as edges
      if (Array.isArray(pathRefs) && pathRefs.length > 0) {
        for (const refPath of pathRefs) {
          // Try the path as-is first, then with extensions
          let resolved = null;
          if (fs.existsSync(refPath) && fs.statSync(refPath).isFile()) {
            resolved = refPath;
          } else {
            // Try appending extensions
            for (const ext of extensions) {
              const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
              const withExt = refPath + dotExt;
              if (fs.existsSync(withExt)) {
                resolved = withExt;
                break;
              }
            }
            // Try as directory with index file
            if (!resolved && fs.existsSync(refPath) && fs.statSync(refPath).isDirectory()) {
              for (const ext of extensions) {
                const dotExt = ext.startsWith('.') ? ext : `.${ext}`;
                const indexFile = path.join(refPath, 'index' + dotExt);
                if (fs.existsSync(indexFile)) {
                  resolved = indexFile;
                  break;
                }
              }
            }
          }
          if (resolved && graph.nodes.has(resolved)) {
            graph.addEdge(file, resolved, 'path-ref');
          }
        }
      }

      // Store export info (with namedConstValues) for cross-file constant propagation
      if (exportsInfo && exportsInfo.namedConstValues && Object.keys(exportsInfo.namedConstValues).length > 0) {
        fileExportsInfo.set(file, exportsInfo);
      }
      // Store unresolved glob refs for second-pass resolution
      if (Array.isArray(unresolvedGlobRefs) && unresolvedGlobRefs.length > 0) {
        fileUnresolvedGlobs.set(file, unresolvedGlobRefs);
      }

      for (const imp of imports) {
        let resolved = resolveImport(file, imp, {
          root: mergedRoot,
          importRoot,
          paths,
          extensions: resolverExts,
        });
        if (resolved) {
          resolved = mapBuiltToSource(resolved);

          if (graph.nodes.has(resolved)) {
            graph.addEdge(file, resolved, 'static-import');
          }
        }
      }

      // Add edges for string-literal dynamic imports when enabled
      if (
        dynamicEdgesOn &&
        Array.isArray(importSpecs) &&
        importSpecs.length > 0
      ) {
        for (const spec of importSpecs) {
          if (!spec || spec.kind !== 'dynamic') continue;
          let resolvedDyn = resolveImport(file, spec.source, {
            root: mergedRoot,
            importRoot,
            paths,
            extensions: extensions.map((e) =>
              e.startsWith('.') ? e : `.${e}`
            ),
          });
          if (resolvedDyn) {
            resolvedDyn = mapBuiltToSource(resolvedDyn);
            if (graph.nodes.has(resolvedDyn)) {
              graph.addEdge(file, resolvedDyn, 'dynamic-import');
            }
          }
        }
      }

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
              resolved = mapBuiltToSource(resolved);
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
    })
  );

  // Cross-file constant propagation: resolve glob refs that use imported constants
  if (fileUnresolvedGlobs.size > 0) {
    for (const [file, refs] of fileUnresolvedGlobs.entries()) {
      for (const ref of refs) {
        // Resolve the import source to an absolute file path
        let targetFile = resolveImport(file, ref.importSource, {
          root: mergedRoot,
          importRoot,
          paths,
          extensions: resolverExts,
        });
        if (targetFile) {
          targetFile = mapBuiltToSource(targetFile);
        }
        if (!targetFile) continue;

        // Look up the exported const value from the target file
        const targetExports = fileExportsInfo.get(targetFile);
        const constValue = targetExports?.namedConstValues?.[ref.identifier];
        if (!constValue) continue;

        // Resolve the glob pattern and add edges
        const fileDir = path.dirname(file);
        try {
          let resolved = fg.sync(constValue, {
            cwd: fileDir,
            absolute: true,
            ignore: ignorePatterns,
            dot: false,
          });
          if (resolved.length === 0 && fileDir !== root) {
            resolved = fg.sync(constValue, {
              cwd: root,
              absolute: true,
              ignore: ignorePatterns,
              dot: false,
            });
          }
          for (const target of resolved) {
            if (graph.nodes.has(target)) {
              graph.addEdge(file, target, 'cross-file-glob');
            }
          }
        } catch (_e) {
          // silently skip unresolvable glob patterns
        }
      }
    }
  }

  // Resolve implicitEdges from config and add them to the graph
  if (fileCfg.implicitEdges && typeof fileCfg.implicitEdges === 'object') {
    for (const [sourceAbs, globs] of Object.entries(fileCfg.implicitEdges)) {
      if (!Array.isArray(globs)) continue;
      for (const pattern of globs) {
        try {
          const resolved = fg.sync(pattern, {
            cwd: root,
            absolute: true,
            ignore: ignorePatterns,
            dot: false,
          });
          for (const target of resolved) {
            if (graph.nodes.has(target)) {
              graph.addEdge(sourceAbs, target, 'implicit');
            }
          }
        } catch (_e) {
          // silently skip unresolvable glob patterns
        }
      }
    }
  }

  // Build cross-file consumption index for exported symbols
  const consumptionIndex = new Map();
  for (const [, info] of fileToSymbols.entries()) {
    const specs = info.importSpecs || [];
    for (const spec of specs) {
      if (!spec || !spec.resolved) continue;
      if (spec.kind === 'dynamic') continue;
      const key = spec.resolved;
      if (!consumptionIndex.has(key)) {
        consumptionIndex.set(key, {
          defaultConsumed: false,
          namespaceConsumed: false,
          namedConsumed: new Set(),
        });
      }
      const entry = consumptionIndex.get(key);
      if (spec.imported.default) entry.defaultConsumed = true;
      if (spec.imported.namespace) entry.namespaceConsumed = true;
      if (Array.isArray(spec.imported.named)) {
        for (const nm of spec.imported.named) entry.namedConsumed.add(nm);
      }
    }
  }

  // Compute live files once — reused for report, cache, and console summary
  console.log('Generating report...');
  const liveFiles = computeLiveFiles(graph, entrypoints);
  // Always-live: expand live set with CLI + config file globs
  if (alwaysLiveGlobs.length > 0) {
    const resolvedAlways = resolveGlobs(alwaysLiveGlobs);
    for (const p of resolvedAlways) {
      if (graph.nodes.has(p)) liveFiles.add(p);
    }
  }
  // Convention files are always live
  for (const p of conventionAlwaysLive) {
    if (graph.nodes.has(p)) liveFiles.add(p);
  }

  const entrypointSet = new Set(entrypoints);

  const writtenPath = options.dirOnly
    ? await reportDirectories(graph, {
        outPath: effectiveOut,
        projectRoot: mergedRoot,
        onlyOrphans: options.onlyOrphans,
        liveFiles,
        packageVersion: pkg.version,
      })
    : await reportGraph(graph, {
        outPath: effectiveOut,
        projectRoot: mergedRoot,
        onlyOrphans: options.onlyOrphans,
        liveFiles,
        symbols: fileToSymbols,
        consumptionIndex,
        exportUsageMap: new Map(
          Array.from(fileToSymbols.entries()).map(([k, v]) => [
            k,
            v.exportUsage || undefined,
          ])
        ),
        entrypointSet,
        packageVersion: pkg.version,
      });
  console.log(`Report generated at ${writtenPath}`);

  // Generate analysis cache for the trace command
  const allFiles = Array.from(graph.nodes);
  const orphanFiles = allFiles.filter((f) => !liveFiles.has(f));
  const reachableFiles = allFiles.filter((f) => liveFiles.has(f));

  const cacheData = {
    version: pkg.version,
    timestamp: new Date().toISOString(),
    root: mergedRoot,
    entrypoints: Array.from(entrypointSet),
    files: allFiles,
    edges: graph.getEdges(),
    reachable: reachableFiles,
    orphans: orphanFiles,
  };

  const cachePath = await writeCache(mergedRoot, cacheData, effectiveCachePath);
  console.log(`Analysis cache generated (used by 'codereap trace') at ${cachePath}`);

  // Console summary — reuses the same liveFiles computed above
  if (options.dirOnly) {
    console.log('Finding orphan directories...');
    const dirRecords = require('../dist/reporter').computeDirectoryRecords(
      graph,
      mergedRoot,
      liveFiles
    );
    const orphanDirs = dirRecords.filter((r) => r.orphan);
    console.log(`Orphan directories count: ${orphanDirs.length}`);
  } else {
    console.log('Finding orphans...');
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
