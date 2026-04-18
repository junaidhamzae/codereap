# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/github/license/junaidhamzae/codereap.svg)](https://github.com/junaidhamzae/codereap/blob/main/LICENSE)

> Clean dead code out of AI-accelerated codebases.

**CodeReap** is a static reachability analyzer for JavaScript and TypeScript projects. It helps you find orphan files, orphan directories, and orphan exports before dead code quietly pollutes your repo, slows refactors, and confuses both humans and AI tools.

CodeReap answers one question, grounded in graph reachability rather than hunches:

> **What in this codebase is still actually reachable?**

---

## Why CodeReap

AI can generate code fast. Cleanup rarely keeps up.

In the era of AI-assisted development and vibe coding, repos accumulate abandoned experiments, duplicate utilities, stale components, old routes, unused configs, and half-finished refactors much faster than teams can manually prune them.

That dead weight causes real problems:

- developers waste time reading files that no longer matter
- AI tools get noisier repo context and make worse suggestions
- refactors feel riskier because nobody is fully sure what is safe to remove
- onboarding gets harder as the codebase grows more misleading than useful
- "temporary" code becomes permanent furniture

CodeReap builds a dependency graph from real project entrypoints, traces supported file-loading patterns, and tells you what is live versus what looks safe to review for deletion.

### Why not just use lint rules?

Lint rules are great for unused variables and simple import issues.

CodeReap operates at a different level. It helps answer questions like:

- Which files are truly unreachable from my app entrypoints?
- Which folders can be removed as a unit?
- Which exports exist but nobody consumes?
- Which files only stay alive because of framework conventions, glob loading, dynamic loading, or aliases?
- What should I prune first for the biggest cleanup win?
- Why is this specific file still reachable — which entrypoint keeps it alive?

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
| `codereap-report.json` | Report of every scanned file or directory, its status, and supporting metadata |
| `.codereap-cache.json` | Analysis cache used by `codereap trace` |

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

Then open the interactive viewer:

```bash
codereap --viewer
```

---

## The killer workflow: trace a single file

Once you have generated a report, you can ask CodeReap why any specific file is live — or why it is orphan.

```bash
codereap trace src/utils/math.ts
```

For a **live** file, CodeReap shows:

- which entrypoints keep it alive
- every import chain from an entrypoint to the file
- the type of each edge in that chain
- direct importers of the file

Example:

```text
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

For an **orphan** file, CodeReap explains why nothing reaches it and adds contextual notes when useful:

```text
FILE: src/legacy/adapter.ts

STATUS: orphan

REASON: No file imports this module

DIRECTORY: src/legacy/ (100% orphan)

NOTES:
  • Entire directory "src/legacy/" is orphan (12 files). May be safe to remove as a unit.
  • This project uses dynamic imports — some orphan files may be loaded at runtime via expressions that could not be statically resolved.
```

This is especially useful in AI-heavy workflows because it turns a vague cleanup question into a grounded one:

**Can I delete this file, and why?**

### Trace options

```bash
codereap trace <file> [options]
```

| Flag | Description |
|------|-------------|
| `--all` | Show every chain and every importer |
| `--json` | Emit structured JSON instead of formatted text |
| `--root <path>` | Project root |
| `--cachePath <path>` | Override cache file location |

The file path may be relative to `--root` or absolute.

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

## What CodeReap detects

CodeReap handles far more than straightforward `import` statements.

It can account for:

- **ESM imports, re-exports, and string-literal dynamic `import(...)`**
- **CommonJS `require(...)`**
- **Path aliases** from `tsconfig.json` / `jsconfig.json`
- **Custom alias mappings** and custom import roots
- **Stylesheet imports** — `@import`, `@use`, `@forward` in SCSS and CSS
- **Glob-based loading** — `glob.sync(...)`, `globSync(...)`, `fast-glob`, including same-file and cross-file constant propagation
- **`path.join(...)` / `path.resolve(...)`** references when arguments can be resolved statically
- **Framework conventions** — Next.js routes, middleware, instrumentation hooks, Storybook config, preview files, and stories
- **npm script entrypoints** referenced from `package.json`
- **Convention/tooling files** such as `tsconfig.json`, `.eslintrc.*`, `.prettierrc`, `jest.config.*`, `.env.*`, and `Dockerfile`, which are auto-marked as always-live

Every edge in the dependency graph is tagged with a type such as:

- `static-import`
- `dynamic-import`
- `glob`
- `path-ref`
- `implicit`
- `cross-file-glob`

That edge typing shows up in reports and trace output, so you can see not only that a file is reachable, but **how** it is reachable.

---

## Entrypoint detection

CodeReap infers entrypoints from:

- `package.json` fields such as `main`, `module`, and `bin`
- npm scripts using commands like `node`, `nodemon`, `ts-node`, `tsx`, `pm2 start`, and `babel-node`
- Next.js conventions such as `pages/**`, `src/pages/**`, `app/**/page`, `app/**/layout`, `app/**/error`, `app/**/loading`, `app/**/not-found`, `middleware.{js,ts}`, `instrumentation.*`, and `next.config.*`
- Storybook config and story globs discovered from `.storybook/main.*`
- custom entry globs passed through `--entry`
- files matched by `alwaysLive` globs and auto-detected convention files

You can turn off framework auto-seeding with `--frameworkEntrypoints off` if you want a stricter view.

---

## CLI reference

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
| `--alias <mappings>` | Alias mappings like `@/*=src/*` | from tsconfig/jsconfig |
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
| `--cachePath <path>` | Override cache file location | `{root}/.codereap-cache` |
| `--purge-cache` | Delete the cache file and exit | off |

### Trace subcommand

```bash
codereap trace <file> [options]
```

See [The killer workflow: trace a single file](#the-killer-workflow-trace-a-single-file).

### Help

```bash
codereap --help
codereap trace --help
```

---

## Configuration file

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

Some files are intentionally unreferenced in code but still matter: i18n JSON, declaration files, config files loaded by tools, and framework convention files.

Mark them explicitly when needed:

```json
{ "alwaysLive": ["locales/**/*.json", "**/*.d.ts"] }
```

### Implicit edges

Some files load dependencies indirectly in ways static analysis cannot infer, such as plugin systems or runtime registries.

Declare those edges explicitly:

```json
{
  "implicitEdges": {
    "src/loader.ts": ["src/plugins/**/*.ts"]
  }
}
```

Keys are source files. Values are glob patterns describing the files they depend on.

### Cache path

You can override the analysis cache location in config or on the CLI:

```json
{ "cachePath": ".codereap-cache" }
```

This is useful if you want to commit the cache, share it across workflows, or place it somewhere else.

---

## Report format

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
          {
            "source": "./constants",
            "resolved": "src/utils/constants.ts",
            "kind": "esm",
            "imported": {
              "default": false,
              "named": ["PI"],
              "namespace": false
            }
          }
        ]
      }
    }
  ]
}
```

Each file record can include:

- **`orphan`** — whether the file is reachable from any entrypoint
- **`in-degree`** — how many other files depend on it
- **`imported-by`** — direct importers, each tagged with edge type
- **`entrypoints`** — every entrypoint that can reach this file
- **`size-bytes`** — file size, useful for prioritising by impact
- **`symbols.exports`** — export-level orphan tracking
- **`symbols.imports`** — detailed import specifiers for orphan rows

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

## The analysis cache

Every run of `codereap` writes `.codereap-cache.json` in the project root unless you override it.

It contains:

- package version and generation timestamp
- resolved project root
- every scanned file
- every typed edge in the graph
- the full entrypoint set
- precomputed reachable and orphan sets

This cache is what makes `codereap trace` fast and context-aware.

You can:

- ignore it in git and regenerate on demand
- commit it if you want shared analysis state
- override its location with `--cachePath` or `cachePath`
- delete it with `codereap --purge-cache`

---

## How it works

1. **Scan** — find source files with `fast-glob`
2. **Parse** — extract imports, exports, dynamic imports, stylesheet directives, glob calls, and supported path-based references
3. **Resolve** — map import specifiers to files using relative resolution, aliases, import roots, tsconfig/jsconfig paths, and Node resolution
4. **Graph** — build a directed dependency graph where files are nodes and references are typed edges
5. **Prune** — compute reachability from real entrypoints to determine what is live
6. **Report** — write JSON with file-level or directory-level orphan status and symbol details
7. **Cache** — persist the analysis state for instant `codereap trace` queries

That is why CodeReap is useful for finding deletion candidates grounded in graph reachability instead of hunches.

---

## Safety and limitations

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

### Helpful orphan notes

When a file is marked orphan, `codereap trace` can proactively flag:

- whether the project uses dynamic imports
- whether the filename resembles a convention-based pattern
- whether the entire directory is orphan and may be removable as a unit

That honesty is a feature. CodeReap aims to be useful without pretending static analysis can read minds.

---

## Suggested workflow

1. Run CodeReap after a large refactor, feature spike, or AI-assisted cleanup
2. Sort top orphan candidates by size and reachability
3. Use `codereap trace <file>` for any surprising or high-value candidate
4. Review framework- or tooling-driven files carefully
5. Mark intentional exceptions with `alwaysLive` or `implicitEdges`
6. Clean up in small, reviewable batches
7. Optionally run CodeReap in CI to stop orphan code from re-accumulating

CodeReap is especially useful:

- after AI-assisted refactors
- after rapid prototyping and spikes
- before handing a repo to an AI agent for implementation
- before or after large migrations
- before archiving or sunsetting product areas
- as a CI guardrail against dead code buildup

Less dead code means less junk for humans and AI to read, summarize, reason over, or confidently misunderstand.

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
npm run test:unit
npm run test:cli
npm run prepublish:check
```

Contributions are welcome — detection improvements, reduced false positives, framework support, and viewer polish are all fair game.

---

## License

[MIT](LICENSE)
