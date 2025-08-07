# CodeReap

[![NPM Version](https://img.shields.io/npm/v/codereap.svg)](https://www.npmjs.com/package/codereap)
[![License](https://img.shields.io/npm/l/codereap.svg)](https://github.com/your-username/codereap/blob/main/LICENSE)

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
| `--pretty`     | Prettify JSON output                                        | `false`                               |

### Example

```bash
codereap --root ./src --exclude "**/__tests__/**,**/*.spec.ts" --pretty
```

This will scan the `src` directory, ignore test files, and output a prettified `codereap-report.json` and `codereap-report.csv`.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)

