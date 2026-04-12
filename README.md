# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/github/license/junaidhamzae/codereap.svg)](https://github.com/junaidhamzae/codereap/blob/main/LICENSE)

> Clean dead code out of AI-accelerated codebases.

Static reachability analysis for JavaScript and TypeScript projects.

CodeReap helps you find orphan files, orphan directories, and orphan exports before dead code quietly pollutes your repo, slows refactors, and confuses both humans and AI tools.

## Quick Start

```bash
# Install globally
npm install -g codereap

# Run inside your project
cd your-project
codereap

# Open the built-in viewer
codereap --viewer
```

CodeReap auto-detects entrypoints from `package.json` and supported framework conventions, scans your source files, and writes a `codereap-report.json` showing what is live and what is orphaned.

## Why CodeReap matters now

AI can generate code fast.
Cleanup usually does not keep up.

In the era of AI-led development and vibe coding, repos accumulate abandoned experiments, duplicate utilities, old routes, stale components, unused configs, and half-finished refactors much faster than teams manually prune them.

That dead weight creates real problems:

- developers waste time reading files that no longer matter
- AI tools get noisier repo context and make worse suggestions
- refactors feel riskier because nobody is fully sure what is safe to remove
- onboarding gets harder as the codebase grows more misleading than useful
- "temporary" code becomes permanent furniture

CodeReap gives you a practical answer to a simple question:

**What in this codebase is still actually reachable?**

It builds a dependency graph from real project entrypoints, traces supported file-loading patterns, and reports what is live versus what looks safe to review for deletion.

## What CodeReap does

CodeReap scans your project and reports:

- **Orphan files** — files that are not reachable from any entrypoint
- **Orphan directories** — folders whose contents are entirely unreachable
- **Orphan exports** — exports that exist but are never consumed
- **File size and in-degree** — useful for prioritising cleanup by impact
- **A local interactive viewer** — for exploring results without staring at raw JSON

This makes it useful not just as a cleanup tool, but as a repo-hygiene tool for fast-moving teams.

## Why not just use lint rules?

Lint rules are great for unused variables and simple import issues.

CodeReap operates at a different level.

It helps answer questions like:

- Which files are truly unreachable from my app entrypoints?
- Which folders can be removed as a unit?
- Which exports exist but nobody consumes?
- Which files only stay alive because of framework conventions, glob loading, or aliases?
- What should I prune first for the biggest cleanup win?

In other words, it focuses on **reachability across the project**, not just local syntax hygiene.

## Built for real-world projects

CodeReap handles more than straightforward `import` statements.

It can account for:

- ESM imports and re-exports
- CommonJS `require(...)`
- string-literal dynamic imports
- `tsconfig.json` / `jsconfig.json` path aliases
- custom alias mappings and import roots
- SCSS and CSS `@import`, `@use`, and `@forward`
- glob-based loading patterns such as `glob.sync(...)`, `globSync(...)`, and `fast-glob`
- some `path.join(...)` / `path.resolve(...)` file references
- framework entrypoint conventions such as Next.js
- Storybook entrypoint and story seeding
- manual always-live overrides for convention-based files
- manual implicit edge declarations for imports that cannot be statically detected

## Where it fits in AI-led development

CodeReap is especially useful when you use AI coding tools heavily.

Typical moments where it helps a lot:

- after AI-assisted refactors
- after feature spikes and rapid prototyping
- before handing a repo to an AI agent for implementation
- before or after large migrations
- before archiving or sunsetting product areas
- as a CI guardrail to stop dead code from piling up

Less dead code means less junk for AI to read, summarize, reason over, or confidently misunderstand.

## Example output

```bash
$ codereap --root ./my-app

Project Source Entrypoints (relative): [ 'src/index.ts', 'src/cli.ts' ]
Scanning for source files...
Found 342 source files.
Parsing files and building dependency graph...
Report generated at codereap-report.json
Orphan files count: 47
Done.
```

## What you get in the report

Each file row can include:

- **`orphan: true/false`** — whether the file is reachable from any entrypoint
- **`size-bytes`** — file size so you can prioritise cleanup by impact
- **`in-degree`** — how many other files depend on it
- **`symbols`** — export-level orphan tracking

This helps you move from "some files look old" to a much more grounded cleanup pass.

## Common Options

| Flag | Description | Default |
|------|-------------|---------|
| `--root <path>` | Directory to scan | `.` |
| `--extensions <exts>` | Comma-separated list of file extensions | `js,ts,jsx,tsx,json,css,scss` |
| `--exclude <globs>` | Patterns to ignore (comma-separated) | — |
| `--out <path>` | Base filename for the JSON report | `codereap-report` |
| `--config <path>` | Path to `codereap.config.json` | auto-detected in root |
| `--importRoot <path>` | Base directory for resolving non-relative imports | from tsconfig/jsconfig |
| `--alias <mappings>` | Alias mappings like `@/*=src/*` (comma-separated) | from tsconfig/jsconfig |
| `--entry <globs>` | Extra entrypoints beyond auto-detected ones | — |
| `--alwaysLive <globs>` | Mark files as live regardless | — |
| `--dirOnly` | Report orphan directories instead of files | off |
| `--onlyOrphans` | Only include orphan rows in the report | off |
| `--viewer` | Open local interactive report UI | off |
| `--dynamicEdges <on\|off>` | Treat string-literal dynamic imports as graph edges | `on` |
| `--frameworkEntrypoints <auto\|off>` | Auto-detect framework entry files | `auto` |
| `--port <port>` | Viewer port | ephemeral |
| `--host <host>` | Viewer host | `127.0.0.1` |
| `--no-open` | Do not auto-open the viewer in a browser | off |

Run `codereap --help` for the full list.

## Real-World Examples

**Basic scan, excluding tests:**

```bash
codereap --root ./src --exclude "**/__tests__/**,**/*.spec.ts"
```

**Find orphan directories for folder-level cleanup:**

```bash
codereap --dirOnly --onlyOrphans
```

**Mark i18n files and type definitions as always live:**

```bash
codereap --alwaysLive "locales/**/*.json,**/*.d.ts"
```

**Add custom entrypoints for scripts or CLIs:**

```bash
codereap --entry "scripts/**/*.js,src/cli/**/*.ts"
```

**Disable framework auto-seeding:**

```bash
codereap --frameworkEntrypoints off
```

**Run analysis and inspect the report locally:**

```bash
codereap && codereap --viewer
```

## Interactive Viewer

CodeReap ships with a built-in local web UI for exploring reports.

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

Then just run:

```bash
codereap
```

You can still override individual options via CLI flags.

**Precedence:** CLI flags > `codereap.config.json` > `tsconfig.json` / `jsconfig.json`

### Aliases and tsconfig/jsconfig

CodeReap reads `compilerOptions.baseUrl` and `paths` from `tsconfig.json` / `jsconfig.json` automatically.

You can override them manually:

```bash
codereap --alias "@/*=src/*,components/*=src/components/*" --importRoot ./src
```

### Always-live files

Some files are intentionally unreferenced in code but still important.

Common examples:

- i18n JSON files
- declaration files
- files loaded by external tools
- convention-based config files

Mark those as always live:

```json
{
  "alwaysLive": ["locales/**/*.json", "**/*.d.ts"]
}
```

### Implicit Edges

Some files load dependencies indirectly in ways that static analysis cannot always infer.

CodeReap auto-detects several glob-loading patterns, including constant propagation across files. For patterns it cannot infer, define them explicitly:

```json
{
  "implicitEdges": {
    "src/loader.ts": ["src/plugins/**/*.ts"]
  }
}
```

Use this for framework glue, plugin systems, file-based registries, or other dynamic loading patterns.

## How It Works

1. **Scan** — finds source files via `fast-glob`
2. **Parse** — extracts imports, exports, dynamic imports, stylesheet directives, glob calls, and supported path-based references
3. **Resolve** — maps import specifiers to file paths using relative resolution, aliases, import roots, tsconfig/jsconfig paths, and Node resolution
4. **Graph** — builds a directed dependency graph where files are nodes and references are edges
5. **Prune** — performs reachability analysis from entrypoints to determine what is live
6. **Report** — writes JSON with file-level or directory-level orphan status and symbol details

This is why CodeReap is useful for identifying deletion candidates that are grounded in graph reachability rather than hunches.

## Entrypoint Detection

CodeReap infers entrypoints from:

- `package.json` fields such as `main`, `module`, and `bin`
- npm scripts using commands such as `node`, `nodemon`, `ts-node`, `tsx`, `pm2 start`, and `babel-node`
- **Next.js** conventions such as `pages/**`, `app/**/page`, `app/**/layout`, middleware, and related special files
- **Storybook** configuration and discovered story globs
- `--entry` globs that you provide manually

This helps reduce false positives in real apps that are driven by framework conventions rather than a single obvious entry file.

## Detected Loading Patterns

CodeReap supports several non-trivial patterns that often keep files alive in real projects.

### Glob import detection

Examples of patterns CodeReap can detect:

```js
// direct string literal
glob.sync('./configs/*.js')

// same-file constant propagation
const PATTERN = './configs/*.js'
glob.sync(PATTERN)

// destructured import
globSync('./modules/*.ts')

// fast-glob alias
fg.sync('./pages/**/*.tsx')

// cross-file constant propagation
// constants.js: export const GLOB = './configs/*.js'
// loader.js: import { GLOB } from './constants'; glob.sync(GLOB)
```

### Path-based references

CodeReap also detects some static file references created with supported `path.join(...)` and `path.resolve(...)` expressions when their arguments can be resolved statically.

This helps catch files that are used without appearing in normal import syntax.

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

A file or directory marked `orphan` is a strong candidate for review and possible deletion.

## Safety and Limitations

CodeReap is a **static analysis tool**, not a blind delete tool.

That is important.

A file being marked orphan usually makes it a strong cleanup candidate, but you should still review before deleting.

Known limitations:

- **Dynamic expressions** — `import(variable)` and computed `require()` cannot usually be resolved statically
- **Runtime loaders** — environment-dependent imports or custom module loaders are not always traceable
- **Convention-heavy tooling** — some files are used by frameworks or tooling without explicit imports and may need `alwaysLive`
- **File types** — only included extensions are scanned unless you configure more
- **Custom architecture quirks** — highly dynamic plugin systems may require `implicitEdges`

That honesty is a feature. CodeReap aims to be useful without pretending static analysis can read minds.

## External Packages

- `node_modules` is never scanned
- only files under the configured root are graphed
- bare package imports such as `react` or `next/navigation` that cannot be resolved into local project files are skipped
- meaningful resolver errors such as `ERR_PACKAGE_PATH_NOT_EXPORTED` are still surfaced

## Suggested Workflow

A practical workflow for teams using AI or moving fast:

1. run CodeReap after a large refactor or feature spike
2. inspect top orphan candidates by size and reachability
3. review framework- or tooling-driven files carefully
4. mark intentional exceptions with `alwaysLive` or `implicitEdges`
5. clean up in small batches
6. optionally run it in CI to stop orphaned code from accumulating again

## Development

```bash
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

## Publishing

```bash
npm run prepublish:check
npm version patch -m "v%s"
npm publish
```

The `preversion` hook enforces a clean working tree and `postversion` pushes tags automatically.

## Contributing

Contributions are welcome.

If you want to improve detection, reduce false positives, add framework support, or polish the viewer, open an issue or submit a pull request.

## License

[MIT](LICENSE)
