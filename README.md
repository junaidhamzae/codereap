# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/github/license/junaidhamzae/codereap.svg)](https://github.com/junaidhamzae/codereap/blob/main/LICENSE)

> Harvest the living, reap the dead.

**CodeReap** is a static reachability analyzer for JavaScript and TypeScript projects. It finds orphan files, orphan directories, and orphan exports — the dead code that quietly pollutes your repo, slows refactors, and confuses both humans and AI tools.

CodeReap answers one question, grounded in graph reachability rather than hunches:

> **What in this codebase is still actually reachable?**

---

## Table of Contents

- [Why CodeReap](#why-codereap)
- [Install](#install)
- [Quick Start](#quick-start)
- [Tracing a Single File](#tracing-a-single-file)
- [The Analysis Cache](#the-analysis-cache)
- [Interactive Viewer](#interactive-viewer)
- [CLI Reference](#cli-reference)
- [Configuration File](#configuration-file)
- [What CodeReap Detects](#what-codereap-detects)
- [Entrypoint Detection](#entrypoint-detection)
- [Report Format](#report-format)
- [How It Works](#how-it-works)
- [Safety and Limitations](#safety-and-limitations)
- [Suggested Workflow](#suggested-workflow)
- [Development](#development)
- [License](#license)

---

## Why CodeReap

AI can generate code fast. Cleanup rarely keeps up.

In the era of AI-led development and vibe coding, repos accumulate abandoned experiments, duplicate utilities, old routes, stale components, unused configs, and half-finished refactors faster than teams can manually prune them.

That dead weight has real costs:

- developers waste time reading files that no longer matter
- AI tools get noisier context and make worse suggestions
- refactors feel riskier because nobody is fully sure what is safe to remove
- onboarding gets harder as the codebase grows more misleading than useful
- "temporary" code becomes permanent furniture

CodeReap builds a dependency graph from real project entrypoints, traces supported file-loading patterns, and reports what is live versus what looks safe to review for deletion.

### Why not just use lint rules?

Lint rules are great for unused variables and simple import issues.

CodeReap operates at a different level. It helps answer questions like:

- Which files are truly unreachable from my app entrypoints?
- Which folders can be removed as a unit?
- Which exports exist but nobody consumes?
- Which files only stay alive because of framework conventions, glob loading, or aliases?
- What should I prune first for the biggest cleanup win?
- **Why is _this specific file_ still reachable — which entrypoint keeps it alive?**

It focuses on **reachability across the project**, not just local syntax hygiene.

---

## Install

```bash
# Global (recommended for CLI use)
npm install -g codereap

# Or as a dev dependency
npm install --save-dev codereap
```

Requires **Node.js 18+**.

---

## Quick Start

Run inside any JavaScript or TypeScript project:

```bash
cd your-project
codereap
```

CodeReap auto-detects entrypoints from `package.json` and supported framework conventions, scans your source files, and writes two files at the project root:

| File | Purpose |
|------|---------|
| `codereap-report.json` | Human-readable report of every file, its status, and its imports |
| `.codereap-cache.json` | Analysis cache used by `codereap trace` (safe to commit or gitignore — your call) |

**Example output:**

```bash
$ codereap --root ./my-app

Project Source Entrypoints (relative): [ 'src/index.ts', 'src/cli.ts' ]
Scanning for source files...
Found 342 source files.
Parsing files and building dependency graph...
Generating report...
Report generated at ./my-app/codereap-report.json
Analysis cache generated (used by 'codereap trace') at ./my-app/.codereap-cache.json
Finding orphans...
Orphan files count: 47
Done.
```

Then open the interactive viewer to explore the results:

```bash
codereap --viewer
```

---

## Tracing a Single File

Once you have generated a report, you can ask CodeReap why any specific file is alive — or why it is orphan:

```bash
codereap trace src/utils/math.ts
```

For a **live** file, CodeReap shows every entrypoint and every import chain keeping it alive:

```
FILE: src/utils/math.ts

STATUS: live

KEPT ALIVE BY:
  • src/index.ts (entrypoint)

CHAINS:
  1. src/index.ts → src/routes.ts → src/utils/math.ts
     [static-import → static-import]
  2. src/cli.ts → src/commands/add.ts → src/utils/math.ts
     [static-import → dynamic-import]

DIRECT IMPORTERS: 2
  • src/routes.ts [static-import]
  • src/commands/add.ts [dynamic-import]
```

For an **orphan** file, CodeReap explains why nothing reaches it and offers contextual notes:

```
FILE: src/legacy/adapter.ts

STATUS: orphan

REASON: No file imports this module

DIRECTORY: src/legacy/ (100% orphan)

NOTES:
  • Entire directory "src/legacy/" is orphan (12 files). May be safe to remove as a unit.
  • This project uses dynamic imports — some orphan files may be loaded at runtime via expressions that could not be statically resolved.
```

### Trace options

```bash
codereap trace <file> [options]
```

| Flag | Description |
|------|-------------|
| `--all` | Show every chain and every importer (no truncation) |
| `--json` | Emit structured JSON instead of formatted text |
| `--root <path>` | Project root (defaults to `cwd`) |
| `--cachePath <path>` | Override cache file location |

The file path may be relative to `--root` or absolute.

---

## The Analysis Cache

Every run of `codereap` writes `.codereap-cache.json` in the project root. It contains:

- package version and generation timestamp
- resolved project root
- every file seen, every edge with its type, every entrypoint
- precomputed live and orphan sets

The cache is what makes `codereap trace` fast and context-aware. It is regenerated on every `codereap` run, so it is always consistent with your latest scan.

You can:

- **`.gitignore` it** if you regenerate on demand (recommended for most teams)
- **Commit it** if you want everyone to share the same cached analysis
- **Override its location** with `--cachePath` or `cachePath` in the config file
- **Delete it** with `codereap --purge-cache`

---

## Interactive Viewer

CodeReap ships with a built-in local web UI for exploring reports visually.

```bash
codereap --viewer
codereap --viewer --port 5173
```

Use it to:

1. Load a previously generated `codereap-report.json`
2. Browse your project tree with expand/collapse
3. Toggle **Only orphans**
4. Sort cleanup candidates by size, file count, in-degree, or orphan ratio
5. Prioritise what to prune first

All processing stays local. No code is uploaded anywhere.

---

## CLI Reference

### Main command

```bash
codereap [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--root <path>` | Directory to scan | `.` |
| `--extensions <exts>` | Comma-separated file extensions | `js,ts,jsx,tsx,json,css,scss` |
| `--exclude <globs>` | Comma-separated glob patterns to ignore | — |
| `--out <path>` | Base filename for the JSON report (no extension) | `{root}/codereap-report` |
| `--config <path>` | Path to `codereap.config.json` | auto-detected in root |
| `--importRoot <path>` | Base directory for non-relative imports | from tsconfig/jsconfig |
| `--alias <mappings>` | Alias mappings like `@/*=src/*` (comma-separated) | from tsconfig/jsconfig |
| `--entry <globs>` | Extra entrypoint globs beyond auto-detected ones | — |
| `--alwaysLive <globs>` | Mark files as live regardless of reachability | — |
| `--dirOnly` | Report orphan directories instead of files | off |
| `--onlyOrphans` | Include only orphan rows in the report | off |
| `--dynamicEdges <on\|off>` | Treat string-literal dynamic imports as edges | `on` |
| `--frameworkEntrypoints <auto\|off>` | Auto-detect framework entry files | `auto` |
| `--viewer` | Open local interactive report UI | off |
| `--port <port>` | Viewer port | ephemeral |
| `--host <host>` | Viewer host | `127.0.0.1` |
| `--no-open` | Do not auto-open the viewer in a browser | off |
| `--cachePath <path>` | Override cache file location (no extension) | `{root}/.codereap-cache` |
| `--purge-cache` | Delete the cache file and exit | — |

### Subcommand

```bash
codereap trace <file> [options]
```

See [Tracing a Single File](#tracing-a-single-file).

### Help

```bash
codereap --help
codereap trace --help
```

---

## Configuration File

Create a `codereap.config.json` at your project root to avoid repeating flags:

```json
{
  "root": ".",
  "extensions": ["js", "ts", "jsx", "tsx", "json", "css", "scss"],
  "exclude": ["**/__tests__/**", "**/*.spec.ts"],
  "out": "codereap-report",
  "cachePath": ".codereap-cache",
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

**Precedence:** CLI flags > `codereap.config.json` > `tsconfig.json` / `jsconfig.json`

### Always-live files

Some files are intentionally unreferenced in code but still matter: i18n JSON, declaration files, tool-consumed configs. Mark them explicitly:

```json
{ "alwaysLive": ["locales/**/*.json", "**/*.d.ts"] }
```

### Implicit edges

Some files load dependencies indirectly in ways static analysis cannot infer (custom plugin systems, runtime registries, etc.). Declare those edges explicitly:

```json
{
  "implicitEdges": {
    "src/loader.ts": ["src/plugins/**/*.ts"]
  }
}
```

Keys are source files; values are glob patterns describing the files they depend on.

### Aliases and tsconfig/jsconfig

CodeReap reads `compilerOptions.baseUrl` and `paths` from `tsconfig.json` / `jsconfig.json` automatically. Override with `--alias` and `--importRoot` when needed.

---

## What CodeReap Detects

CodeReap handles far more than straightforward `import` statements:

- **ESM imports, re-exports, and dynamic `import(...)` with string literals**
- **CommonJS `require(...)`**
- **Path aliases** from `tsconfig.json` / `jsconfig.json`
- **Custom alias mappings** and custom import roots
- **Stylesheet imports** — `@import`, `@use`, `@forward` in SCSS and CSS
- **Glob-based loading** — `glob.sync(...)`, `globSync(...)`, `fast-glob`, including:
  - direct string literals: `glob.sync('./configs/*.js')`
  - same-file constant propagation: `const P = './configs/*'; glob.sync(P)`
  - **cross-file constant propagation** across imported modules
- **`path.join(...)` / `path.resolve(...)`** file references when arguments can be resolved statically
- **Framework conventions** — Next.js routes (Pages and App Router), middleware, instrumentation hooks, Storybook config and stories
- **npm script entrypoints** — files referenced in `package.json` scripts via `node`, `nodemon`, `ts-node`, `tsx`, `pm2 start`, `babel-node`
- **Convention/tooling files** — `tsconfig.json`, `.eslintrc.*`, `.prettierrc`, `jest.config.*`, `.env.*`, `Dockerfile`, etc. are auto-marked as always-live

Every edge in the dependency graph is tagged with its **type**: `static-import`, `dynamic-import`, `glob`, `path-ref`, `implicit`, or `cross-file-glob`. This shows up in both the report and in `codereap trace` output, so you always know _how_ one file reaches another.

---

## Entrypoint Detection

CodeReap infers entrypoints from:

- `package.json` fields: `main`, `module`, `bin`
- **npm scripts** — commands like `node`, `nodemon`, `ts-node`, `tsx`, `pm2 start`, `babel-node` are parsed for file arguments
- **Next.js** — `pages/**`, `src/pages/**`, `app/**/page`, `app/**/layout`, `app/**/error`, `app/**/loading`, `app/**/not-found`, `middleware.{js,ts}`, `instrumentation.*`, `next.config.*`
- **Storybook** — `.storybook/main.*`, `.storybook/preview.*`, and all story globs parsed from the main config
- `--entry` globs you provide manually
- Any file under `alwaysLive` globs or auto-detected convention files

You can turn off framework auto-seeding with `--frameworkEntrypoints off` if you want a stricter view.

---

## Report Format

### File report (default)

```json
{
  "version": "1.0.0",
  "timestamp": "2026-04-18T10:00:00.000Z",
  "root": "/abs/path/to/project",
  "entrypoints": ["src/index.ts", "src/cli.ts"],
  "total-files": 342,
  "orphan-count": 47,
  "live-count": 295,
  "files": [
    {
      "node": "src/utils/math.ts",
      "exists": true,
      "in-degree": 0,
      "imported-by": [],
      "entrypoints": [],
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
        },
        "imports": [
          { "source": "./constants", "resolved": "src/utils/constants.ts", "kind": "esm", "imported": { "default": false, "named": ["PI"], "namespace": false } }
        ]
      }
    }
  ]
}
```

Each file record includes:

- **`orphan`** — whether the file is reachable from any entrypoint
- **`in-degree`** — how many other files depend on it
- **`imported-by`** — direct importers, each tagged with edge type
- **`entrypoints`** — every entrypoint that can reach this file
- **`size-bytes`** — file size, useful for prioritising by impact
- **`symbols.exports`** — export-level orphan tracking (per default and named export)
- **`symbols.imports`** — detailed import specifiers (included for orphan rows)

### Directory report (`--dirOnly`)

```json
{
  "version": "1.0.0",
  "timestamp": "2026-04-18T10:00:00.000Z",
  "root": "/abs/path/to/project",
  "total-directories": 48,
  "orphan-count": 3,
  "live-count": 45,
  "directories": [
    {
      "directory": "src/legacy",
      "file-count": 12,
      "external-in-degree": 0,
      "orphan": true,
      "size-bytes": 45678
    }
  ]
}
```

A file or directory marked `orphan` is a strong candidate for review and possible deletion.

---

## How It Works

1. **Scan** — finds source files via `fast-glob`
2. **Parse** — extracts imports, exports, dynamic imports, stylesheet directives, glob calls, and supported path-based references
3. **Resolve** — maps import specifiers to file paths using relative resolution, aliases, import roots, tsconfig/jsconfig paths, and Node resolution
4. **Graph** — builds a directed dependency graph where files are nodes and references are typed edges
5. **Prune** — performs reachability analysis from entrypoints to determine what is live
6. **Report** — writes JSON with file-level or directory-level orphan status and symbol details
7. **Cache** — persists the full analysis state for instant `codereap trace` queries

This is why CodeReap is useful for identifying deletion candidates grounded in graph reachability rather than hunches.

---

## Safety and Limitations

CodeReap is a **static analysis tool**, not a blind delete tool.

A file marked orphan is usually a strong cleanup candidate, but you should still review before deleting.

Known limitations:

- **Dynamic expressions** — `import(variable)` and computed `require()` cannot usually be resolved statically
- **Runtime loaders** — environment-dependent imports or custom module loaders may not be traceable
- **Convention-heavy tooling** — some files are used by frameworks or tooling without explicit imports and may need `alwaysLive`
- **File types** — only included extensions are scanned unless you configure more
- **Highly dynamic plugin systems** — may require `implicitEdges`

### External packages

- `node_modules` is never scanned
- only files under the configured root are graphed
- bare package imports such as `react` or `next/navigation` that cannot be resolved to local files are skipped

### What orphan notes tell you

When a file is marked orphan, the `codereap trace` output will proactively flag:

- whether the project uses dynamic imports (which could load files at runtime)
- whether the filename matches a convention-based pattern (`middleware.*`, `*.config.*`, `*.d.ts`, `_app.*`, `*.stories.*`, etc.)
- whether the _entire directory_ is orphan (a strong signal to delete as a unit)

That honesty is a feature. CodeReap aims to be useful without pretending static analysis can read minds.

---

## Suggested Workflow

1. Run CodeReap after a large refactor, feature spike, or AI-assisted cleanup
2. Inspect top orphan candidates by size and reachability
3. For any surprising result, run `codereap trace <file>` to see exactly why
4. Review framework- or tooling-driven files carefully
5. Mark intentional exceptions with `alwaysLive` or `implicitEdges`
6. Clean up in small, reviewable batches
7. Optionally run CodeReap in CI to stop orphan code from re-accumulating

CodeReap is especially useful:

- after AI-assisted refactors
- after feature spikes and rapid prototyping
- before handing a repo to an AI agent for implementation
- before or after large migrations
- before archiving or sunsetting product areas
- as a CI guardrail to stop dead code from piling up

Less dead code means less junk for AI to read, summarize, reason over, or confidently misunderstand.

---

## Development

```bash
git clone https://github.com/junaidhamzae/codereap.git
cd codereap
npm install
npm run build
npm test
```

### Useful scripts

```bash
npm run test:unit           # unit tests only
npm run test:cli            # end-to-end CLI tests (builds first)
npm run prepublish:check    # build + full test suite
```

Contributions are welcome — detection improvements, reduced false positives, new framework support, and viewer polish are all fair game. Open an issue or pull request.

---

## License

[MIT](LICENSE)
