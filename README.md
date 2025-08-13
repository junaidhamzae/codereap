# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/github/license/junaidhamzae/codereap.svg)](https://github.com/junaidhamzae/codereap/blob/main/LICENSE)

> Harvest the living, reap the dead.

CodeReap is a command‑line tool that helps you find dead (or “orphan”) files and directories in JavaScript/TypeScript projects. It scans your source tree, builds a dependency graph from your import/require statements, and determines which files are reachable from your project’s entry points. Anything not reachable is marked as an orphan, so you can confidently delete it and keep your repo lean.

---

## Why use CodeReap?

Modern codebases accumulate unused components, pages and modules over time. Those unused files bloat your repository and slow down refactoring. CodeReap acts like a grim reaper for your codebase — it identifies and reports the files or folders that nothing else imports. This helps you:

- keep projects tidy and maintainable,
- reduce bundle sizes by removing unused code,
- catch mistaken imports or misconfigured aliases.

---

## How it works

- **Scan** – Recursively scans your project for source files (`.js`, `.ts`, `.jsx`, `.tsx`, `.json`, `.css`, `.scss` by default). You can customise the set of extensions to include.
- **Parse** – JavaScript/TypeScript files are parsed with Babel to collect `import`, `require` and dynamic `import()` statements. Other file types are still represented as nodes.
- **Parse** – JavaScript/TypeScript files are parsed with Babel to collect `import`, `require` and dynamic `import()` statements. For JSON file reports, CodeReap also collects exported symbols for all files and per‑import specifiers for orphan files. Other file types are still represented as nodes.
- **Resolve** – Imports are resolved using relative paths, `baseUrl`/`paths` mappings from `tsconfig.json` or `jsconfig.json`, custom alias patterns and an optional `importRoot`. Node.js resolution is used as a last resort.
- **Graph** – A directed graph is built where each file is a node and edges represent dependencies.
- **Entrypoints** – Entrypoints are inferred from your `package.json` (`main`, `module`, `bin`), script commands (`node`, `nodemon`, `pm2 start`, `ts-node`, `tsx`, `babel-node`, or plain file references), and (when enabled) framework conventions. For Next.js, route files in `pages/` or `app/` and `middleware.{js,ts}` are auto‑seeded. When `rootDir` and `outDir` are defined, compiled JavaScript is mapped back to its TypeScript source.
- **Prune (reachability)** – From entrypoints, the graph is traversed to find all live files. Files that are not reachable are marked as orphans.
- **Report** – Results are written to JSON. File reports include the path, an existence flag, in‑degree (incoming edges, informational) and whether it is an orphan. Directory reports aggregate counts and whether a directory is orphan.

---

## Installation

```bash
npm install -g codereap
```

Run `codereap --help` at any time to see available options.

---

## Usage

```bash
codereap [options]
```

### Key options

- `--root <path>` – root directory to scan (defaults to current working directory)
- `--extensions <exts>` – comma‑separated list of extensions (default: `js,ts,jsx,tsx,json,css,scss`)
- `--exclude <patterns>` – comma‑separated glob patterns to ignore (e.g. `**/__tests__/**`)
- `--out <path>` – base filename for the JSON report (default: `codereap-report.json`)
- `--config <path>` – path to `codereap.config.json` (if present and not overridden)
- `--importRoot <path>` – override the base directory used to resolve non‑relative imports
- `--alias <pattern=target>` – one or more alias mappings (comma‑separate) like TypeScript `paths`
- `--dirOnly` – aggregate by directory and report orphan directories instead of files
- `--onlyOrphans` – include only orphan rows in the report
- `--frameworkEntrypoints <auto|off>` – enable/disable framework auto‑seeding (default: `auto`)
- `--entry <globs>` – comma‑separated glob(s) for extra entrypoints (relative to `--root`)
- `--alwaysLive <globs>` – comma‑separated glob(s) to mark files as live regardless of traversal (relative to `--root`)
 - `--dynamicEdges <on|off>` – treat string‑literal dynamic imports (`import('...')`) as graph edges (default: `on`)

---

## Examples

Scan the `src` folder, ignore tests and generate a prettified JSON report:

```bash
codereap --root ./src \
  --exclude "**/__tests__/**,**/*.spec.ts" \
  --out codereap-report
```

Aggregate by directory and only list orphan folders:

```bash
codereap --dirOnly --onlyOrphans --out codereap-dirs
```

Notes:
- A JSON report is always written to `<out>.json` (default: `codereap-report.json`).
- All paths in reports are relative to `--root`.
- JSON output is always pretty‑printed.
- Framework auto‑seeding currently supports Next.js (pages/, src/pages/, app/ routes, and middleware), respecting `--exclude`.
- Reachability is computed from combined entrypoints (package.json + auto‑seeded + `--entry`). Files matching `--alwaysLive` are unioned into the live set after traversal.
- In‑degree remains informational.
- CSV output is no longer supported.
 - String‑literal dynamic imports add edges by default to improve reachability (disable with `--dynamicEdges off`). Non‑literal dynamic imports are not resolved; use `--alwaysLive` globs for those cases.

Next.js auto detection (default):

```bash
codereap --root . --out codereap-report
```

Disable framework auto‑seeding:

```bash
codereap --root . --frameworkEntrypoints off --out codereap-report
```

Add custom entrypoints:

```bash
codereap --root . --entry "scripts/**/*.js,src/cli/**/*.{ts,js}" --out codereap-report
```

Mark files as always live (e.g. i18n, type defs):

```bash
codereap --root . --alwaysLive "locales/**/*.json,**/*.d.ts" --out codereap-report
```

Generate only orphan rows with enriched import targets (JSON):

```bash
codereap --root ./src --onlyOrphans --out codereap-orphans
```

Disable dynamic import edges (stricter pruning):

```bash
codereap --root . --dynamicEdges off --out codereap-report
```

---

## Working with aliases and tsconfig

CodeReap will read `tsconfig.json` or `jsconfig.json` to honour `compilerOptions.baseUrl` and `paths` mappings and will automatically map built JavaScript files back to their TypeScript sources when `rootDir` and `outDir` are defined.

You can override these settings on the command line with `--importRoot` and `--alias`. Settings may also be specified in a `codereap.config.json` file.

Precedence is: CLI > codereap.config.json > tsconfig/jsconfig.

### Example codereap.config.json

```json
{
  "root": ".",
  "extensions": ["js", "ts", "jsx", "tsx", "json", "css", "scss"],
  "exclude": ["**/__tests__/**", "**/*.spec.ts"],
  "importRoot": "src",
  "aliases": {
    "src/*": ["src/*"],
    "@/*": ["src/*"],
    "components/*": ["src/components/*"]
  },
  
}
```

You can then run:

```bash
codereap --config codereap.config.json
```

…and still override individual options via CLI flags as needed.

#### CLI alias examples (quote wildcards in zsh)

```bash
codereap --alias "@/*=src/*,components/*=src/components/*" --importRoot ./src
codereap --alias "src/*=src/*" --root .
```

---

## External packages and logging

- Node modules are not scanned. CodeReap builds the graph only from files under `--root` and ignores `node_modules` by default.
- Bare package imports (e.g., `react`, `next/navigation`) that cannot be resolved due to being simply missing will not print “Could not resolve …” noise. These common not‑found cases are suppressed to keep output clean.
- CodeReap still logs meaningful resolver errors (with error codes), including:
  - Relative/absolute import failures
  - Package resolution errors other than not‑found (for example, `ERR_PACKAGE_PATH_NOT_EXPORTED`)

Notes:
- If you use absolute aliases, set them via `tsconfig.json` (`compilerOptions.baseUrl`, `paths`), `--importRoot`, or `--alias` so local imports resolve cleanly.
- External dependencies remain visible in JSON under `symbols.imports` as bare `source` entries with `resolved` omitted.

## Interpreting the report

When you run CodeReap without `--dirOnly`, each row in the report represents a file. Columns:

- `node` – relative path to the file
- `exists` – always `true` for scanned files
- `in‑degree` – number of other files that import it (informational)
- `orphan` – `true` if the file is not reachable from any entry point

When writing JSON file reports (orphan status reflects reachability from entrypoints, including framework‑seeded and user‑provided entries):

- All rows include `symbols.exports` (per‑export usage):
  - `default`: `{ exists: boolean, referencedInFile: boolean, orphan: boolean }`
  - `named`: `Array<{ name: string, referencedInFile: boolean, orphan: boolean, reexport?: boolean }>`
  - `reExports`: `Array<{ source: string, named?: string[], star?: boolean }>` (informational)
- Only orphan rows include `symbols.imports`. Each item has:
  - `source` (string) – as written in code
  - `resolved` (string, optional) – root‑relative path when resolvable into the scanned graph
  - `kind` (`'esm'|'cjs'|'dynamic'`)
  - `imported` – `{ default: boolean, named: string[], namespace: boolean }`
  - With `--onlyOrphans` (JSON), if `resolved` points to a scanned file, a `target` is included with `{ node, exports }` summarising that file’s exports.

Example orphan row (JSON):

```json
{
  "node": "src/utils/math.ts",
  "exists": true,
  "in-degree": 0,
  "orphan": true,
  "symbols": {
    "exports": {
      "default": { "exists": false, "referencedInFile": false, "orphan": true },
      "named": [
        { "name": "add", "referencedInFile": false, "orphan": false },
        { "name": "sub", "referencedInFile": false, "orphan": true }
      ],
      "reExports": []
    },
    "imports": [
      {
        "source": "./consts",
        "resolved": "src/utils/consts.ts",
        "kind": "esm",
        "imported": { "default": false, "named": ["PI"], "namespace": false },
        "target": { "node": "src/utils/consts.ts", "exports": { "hasDefault": false, "named": ["PI", "E"], "reExports": [] } }
      }
    ]
  }
}
```

With `--dirOnly`, the report lists directories. Each record includes:

- `directory` – directory path (relative)
- `file-count` – number of files in the directory
- `external-in-degree` – imports coming from outside the directory
- `orphan` – `true` when `file-count > 0`, `external-in-degree === 0`, and none of the files in the directory are reachable from any entrypoint

A file or directory flagged as `orphan` is a candidate for deletion. Some files (e.g. test fixtures or documentation) may be intentionally unreferenced — add their patterns to `--exclude` or your config file.

---

## Limitations and tips

- Dynamic import expressions (`import(someVariable)`) and computed `require` calls are treated as dynamic and may not be fully resolved.
- CodeReap does not analyse runtime module resolution (e.g. globbing or environment‑dependent imports); review results before deleting.
- Only the file types you include are scanned; other assets (images, fonts, etc.) are ignored unless you add their extensions.
- Running CodeReap regularly in CI can help prevent new orphan files from creeping in.

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

## Local development and testing

Run the TypeScript build and the full test suite locally.

1) Install deps

```bash
npm install
```

2) Build

```bash
npm run build
```

3) Run unit tests

```bash
npm test
```

4) Run CLI integration tests

```bash
npm run test:cli
```

Notes:

- Tests include unit tests for core logic and CLI integration tests against fixtures.
- CLI tests use normalized and deterministic JSON output; some suites use snapshots. If snapshots change, verify the diff is intentional before updating.

---

## Pre‑publish checklist

Before publishing a new version to npm, run the checklist script:

```bash
npm run prepublish:check
```

This will:

- Build TypeScript sources
- Run unit tests
- Run CLI integration tests

The project enforces strong coverage thresholds during tests, acting as a guard rail before publish.

---

## License

[MIT](LICENSE)

