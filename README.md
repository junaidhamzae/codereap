# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/github/license/junaidhamzae/codereap.svg)](https://github.com/junaidhamzae/codereap/blob/main/LICENSE)

> Harvest the living, reap the dead.

Find dead files in your JavaScript/TypeScript projects. CodeReap builds a dependency graph from your imports and tells you which files nothing uses.

## Quick Start

```bash
# Install
npm install -g codereap

# Run in your project
cd your-project
codereap

# View results interactively
codereap --viewer
```

That's it. CodeReap auto-detects your entrypoints from `package.json` and frameworks like Next.js, scans all source files, and writes a `codereap-report.json` with every file marked as live or orphan.

---

## What you get

```
$ codereap --root ./my-app

Project Source Entrypoints (relative): [ 'src/index.ts', 'src/cli.ts' ]
Scanning for source files...
Found 342 source files.
Parsing files and building dependency graph...
Report generated at codereap-report.json
Orphan files count: 47
Done.
```

Each file in the report includes:
- **`orphan: true/false`** — is this file reachable from any entrypoint?
- **`size-bytes`** — file size, so you can prioritise cleanup by impact
- **`in-degree`** — how many other files import it
- **`symbols`** — per-export orphan tracking (which exports are actually consumed)

---

## Common Options

| Flag | Description | Default |
|------|-------------|---------|
| `--root <path>` | Directory to scan | `.` |
| `--extensions <exts>` | Comma-separated list of file extensions | `js,ts,jsx,tsx,json,css,scss` |
| `--exclude <globs>` | Patterns to ignore (comma-separated) | — |
| `--out <path>` | Base filename for the JSON report | `codereap-report` |
| `--config <path>` | Path to `codereap.config.json` | auto-detected in root |
| `--importRoot <path>` | Base directory for resolving non-relative imports | from tsconfig |
| `--alias <mappings>` | Alias mappings like `@/*=src/*` (comma-separated) | from tsconfig |
| `--entry <globs>` | Extra entrypoints beyond auto-detected | — |
| `--alwaysLive <globs>` | Mark files as live regardless (e.g. i18n) | — |
| `--dirOnly` | Report orphan directories instead of files | off |
| `--onlyOrphans` | Only include orphan rows in the report | off |
| `--viewer` | Open interactive web UI to explore results | off |
| `--dynamicEdges <on\|off>` | Treat `import('...')` as graph edges | `on` |
| `--frameworkEntrypoints <auto\|off>` | Auto-detect framework entry files | `auto` |

Run `codereap --help` for the full list.

---

## Real-World Examples

**Basic scan, exclude tests:**
```bash
codereap --root ./src --exclude "**/__tests__/**,**/*.spec.ts"
```

**Find orphan directories (folder-level cleanup):**
```bash
codereap --dirOnly --onlyOrphans
```

**Mark i18n and type defs as always live:**
```bash
codereap --alwaysLive "locales/**/*.json,**/*.d.ts"
```

**Add custom entrypoints:**
```bash
codereap --entry "scripts/**/*.js,src/cli/**/*.ts"
```

**Disable framework auto-seeding:**
```bash
codereap --frameworkEntrypoints off
```

---

## Interactive Viewer

CodeReap ships with a built-in local web UI for exploring reports.

```bash
codereap --viewer
codereap --viewer --port 5173
```

1. Run `codereap --viewer` in your project
2. Load a previously generated `codereap-report.json`
3. **Explore Tree** — browse your project structure with expand/collapse
4. **Prioritize Pruning** — sort orphans by size, file count, or export ratio
5. **Copy paths** — copy file paths for cleanup scripts

All processing happens in your browser. No data is uploaded.

---

## Configuration File

Create a `codereap.config.json` in your project root to avoid passing flags every time:

```json
{
  "root": ".",
  "extensions": ["js", "ts", "jsx", "tsx", "json", "css", "scss"],
  "exclude": ["**/__tests__/**", "**/*.spec.ts"],
  "out": "codereap-report",
  "importRoot": "src",
  "aliases": {
    "@/*": ["src/*"],
    "components/*": ["src/components/*"]
  },
  "alwaysLive": ["locales/**/*.json", "**/*.d.ts"],
  "implicitEdges": {
    "server/api/apiConfiguration.js": ["server/configs/*.js"]
  }
}
```

Then just run `codereap` — or override individual options via CLI flags.

**Precedence:** CLI flags > `codereap.config.json` > `tsconfig.json`/`jsconfig.json`

### Aliases and tsconfig

CodeReap reads `compilerOptions.baseUrl` and `paths` from `tsconfig.json`/`jsconfig.json` automatically. Override with `--importRoot` and `--alias`:

```bash
codereap --alias "@/*=src/*,components/*=src/components/*" --importRoot ./src
```

### Implicit Edges

Some files load dependencies dynamically (e.g. `glob.sync('./configs/*.js')`). CodeReap auto-detects `glob.sync`/`globSync` patterns, including constant propagation across files. For patterns it can't detect, use `implicitEdges`:

```json
{
  "implicitEdges": {
    "src/loader.ts": ["src/plugins/**/*.ts"]
  }
}
```

---

## How It Works

1. **Scan** — finds source files via `fast-glob` (`.js`, `.ts`, `.jsx`, `.tsx`, `.json`, `.css`, `.scss`)
2. **Parse** — extracts `import`, `require`, `export`, and `glob.sync()` calls via Babel AST
3. **Resolve** — maps import specifiers to file paths (relative, aliases, `baseUrl`, Node.js resolution)
4. **Graph** — builds a directed dependency graph (files = nodes, imports = edges)
5. **Prune** — BFS from entrypoints marks all reachable files; the rest are orphans
6. **Report** — writes JSON with file-level or directory-level orphan status and symbol details

### Entrypoint Detection

CodeReap infers entrypoints from:
- `package.json` fields: `main`, `module`, `bin`
- npm scripts: commands using `node`, `nodemon`, `ts-node`, `tsx`, `pm2 start`, `babel-node`
- **Next.js** (auto): `pages/**`, `app/**/page`, `app/**/layout`, `middleware.{js,ts}`
- `--entry` flag: your custom globs

### Glob Import Detection

CodeReap detects files loaded via glob patterns:

```js
// All of these are detected automatically:
glob.sync('./configs/*.js')           // direct string literal
const PATTERN = './configs/*.js';
glob.sync(PATTERN)                     // same-file constant propagation
globSync('./modules/*.ts')             // destructured import
fg.sync('./pages/**/*.tsx')            // fast-glob alias

// Cross-file constant propagation also works:
// constants.js: export const GLOB = './configs/*.js'
// loader.js:    import { GLOB } from './constants'; glob.sync(GLOB)
```

---

## Report Format

### File report (default)

```json
{
  "node": "src/utils/math.ts",
  "exists": true,
  "in-degree": 0,
  "orphan": true,
  "size-bytes": 1234,
  "symbols": {
    "exports": {
      "default": { "exists": false, "referencedInFile": false, "orphan": true },
      "named": [
        { "name": "add", "referencedInFile": false, "orphan": false },
        { "name": "sub", "referencedInFile": false, "orphan": true }
      ],
      "reExports": []
    }
  }
}
```

### Directory report (`--dirOnly`)

```json
{
  "directory": "src/legacy",
  "file-count": 12,
  "external-in-degree": 0,
  "orphan": true,
  "size-bytes": 45678
}
```

A file/directory flagged `orphan` is a candidate for deletion. Some files (test fixtures, config files loaded by tools) may be intentionally unreferenced — add them to `--alwaysLive` or `--exclude`.

---

## Limitations

- **Dynamic expressions** — `import(variable)` and computed `require()` can't be resolved statically. Use `--alwaysLive` for those.
- **Runtime loaders** — environment-dependent imports or custom module loaders aren't traced. Review results before deleting.
- **File types** — only included extensions are scanned; images, fonts, etc. are ignored unless you add their extensions.
- **Tip:** run CodeReap in CI to catch new orphan files before they accumulate.

---

## External Packages

- `node_modules` is never scanned. Only files under `--root` are graphed.
- Bare package imports (`react`, `next/navigation`) that can't be resolved are silently skipped.
- Meaningful resolver errors (e.g. `ERR_PACKAGE_PATH_NOT_EXPORTED`) are still logged.

---

## Development

```bash
npm install          # install deps
npm run build        # compile TypeScript + bundle viewer
npm test             # run all tests (unit + CLI integration)
```

### Publishing

```bash
npm run prepublish:check         # build + test
npm version patch -m "v%s"       # bump, commit, tag, push
npm publish                      # publish to npm
```

The `preversion` hook enforces a clean working tree. `postversion` auto-pushes with tags.

---

## Contributing

Contributions welcome! Open an issue or submit a pull request.

---

## License

[MIT](LICENSE)
