# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/github/license/junaidhamzae/codereap.svg)](https://github.com/junaidhamzae/codereap/blob/main/LICENSE)

> Harvest the living, reap the dead.

CodeReap is a command-line tool that scans your codebase, builds a dependency graph, and identifies orphan files that are no longer referenced by any other part of your project.

## What it does

1.  **Scans**: Recursively scans your project for source files (`.js`, `.ts`, `.jsx`, `.tsx`).
2.  **Parses**: Uses AST (Abstract Syntax Tree) parsing to identify all `import` and `export` statements.
3.  **Graphs**: Builds a directed graph of all dependencies between your files.
4.  **Reports & Prunes**: Identifies all nodes in the graph with an in-degree of zero—these are your orphan files.

## Why the name works

Like a grim reaper for your codebase, CodeReap helps you identify and remove the dead code that's bloating your project.

## Installation

```bash
npm install -g codereap
```

## Usage

```bash
codereap [options]
```

### Options

| Flag           | Description                                                 | Default                               |
| -------------- | ----------------------------------------------------------- | ------------------------------------- |
| `--root`       | Root directory of the project to scan                       | `process.cwd()`                       |
| `--extensions` | Comma-separated list of file extensions to include          | `js,ts,jsx,tsx`                       |
| `--exclude`    | Comma-separated list of glob patterns to exclude            | `''`                                  |
| `--out`        | Output file path for the report (without extension)         | `codereap-report`                     |
| `--format`     | Output format: `json` or `csv` (omit to skip writing files) | `''` (no file output)                 |
| `--config`     | Path to `codereap.config.json`                              | `./codereap.config.json` if present   |
| `--importRoot` | Directory to resolve non-relative imports from              | from ts/jsconfig or config            |
| `--alias`      | Alias mapping `pattern=target` (repeat or comma-separate)   | from ts/jsconfig `paths` or config    |

### Example

```bash
codereap --root ./src --exclude "**/__tests__/**,**/*.spec.ts" --format json --out codereap-report
```

This scans the `src` directory, ignores test files, and writes a prettified JSON report to `codereap-report.json`.

To write CSV instead:

```bash
codereap --root ./src --format csv --out codereap-report
```

Note: File paths in the JSON/CSV are relative to `--root`.

### Configuration

CodeReap can read import resolution settings from `codereap.config.json`. CLI flags override the file, which overrides `tsconfig.json`/`jsconfig.json`.

Example `codereap.config.json`:

```json
{
  "root": ".",
  "extensions": ["js", "ts", "jsx", "tsx"],
  "exclude": ["**/__tests__/**", "**/*.spec.ts"],
  "importRoot": "src",
  "aliases": {
    "src/*": ["src/*"],
    "@/*": ["src/*"],
    "components/*": ["src/components/*"]
  }
}
```

CLI alias examples (quote wildcards in zsh):

```bash
codereap --alias "@/*=src/*,components/*=src/components/*" --importRoot ./src
codereap --alias "src/*=src/*" --root .
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)

